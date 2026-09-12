import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma, Prisma } from "@atelier/db";
import { logger } from "@/lib/logger";
import { idOf, isManagedSubscription, lockRestaurant, stripeClient, subscriptionData } from "@/lib/billing";

export const dynamic = "force-dynamic";

async function applyEvent(tx: Prisma.TransactionClient, event: Stripe.Event) {
  const checkout = event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded";
  const subscriptionEvent = event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted";
  if (!checkout && !subscriptionEvent) return;

  const object = event.data.object as Stripe.Checkout.Session | Stripe.Subscription;
  let restaurantId: string;
  let subscriptionId: string;
  if (checkout) {
    const session = object as Stripe.Checkout.Session;
    // Solo sesiones creadas por nuestro endpoint autenticado. Un antiguo
    // Payment Link con un client_reference_id editable no concede acceso.
    if (session.metadata?.billing_version !== "1" || !session.metadata.restaurant_id ||
        session.client_reference_id !== session.metadata.restaurant_id) {
      logger.warn("stripe_checkout_unmanaged", { eventId: event.id });
      return;
    }
    restaurantId = session.metadata.restaurant_id;
    subscriptionId = idOf(session.subscription) ?? "";
    if (!subscriptionId || session.mode !== "subscription") return;
  } else {
    subscriptionId = object.id;
    // Sin fallback por customer: una suscripción vieja del mismo cliente no
    // debe cancelar una suscripción nueva.
    const found = await tx.restaurant.findFirst({ where: { stripeSubscriptionId: subscriptionId }, select: { id: true } });
    if (!found) return;
    restaurantId = found.id;
  }

  await lockRestaurant(tx, restaurantId);
  const restaurant = await tx.restaurant.findUnique({ where: { id: restaurantId } });
  if (!restaurant?.stripeCustomerId) return;
  const stripe = stripeClient();

  if (checkout) {
    const session = await stripe.checkout.sessions.retrieve(object.id);
    if (session.status !== "complete" || session.payment_status !== "paid" ||
        session.mode !== "subscription" || session.metadata?.billing_version !== "1" ||
        session.metadata.restaurant_id !== restaurantId || session.client_reference_id !== restaurantId ||
        idOf(session.customer) !== restaurant.stripeCustomerId || idOf(session.subscription) !== subscriptionId) return;
    if (restaurant.stripeSubscriptionId && restaurant.stripeSubscriptionId !== subscriptionId) {
      const previous = await stripe.subscriptions.retrieve(restaurant.stripeSubscriptionId);
      if (!["canceled", "incomplete_expired"].includes(previous.status)) {
        logger.warn("stripe_checkout_subscription_conflict", { eventId: event.id });
        return;
      }
    }
  } else if (restaurant.stripeSubscriptionId !== subscriptionId) {
    return;
  }

  // Leer el estado actual DESPUÉS del bloqueo evita aplicar snapshots antiguos,
  // incluso si llegan eventos fuera de orden o con el mismo event.created.
  const sub = await stripe.subscriptions.retrieve(subscriptionId, { expand: ["discounts"] });
  if (!isManagedSubscription(sub, restaurantId, restaurant.stripeCustomerId)) {
    logger.warn("stripe_subscription_mismatch", { eventId: event.id });
    return;
  }
  await tx.restaurant.update({
    where: { id: restaurantId },
    data: { stripeSubscriptionId: sub.id, ...subscriptionData(sub, restaurant.graceUntil) },
  });
  logger.info("stripe_subscription_synced", { eventId: event.id, restaurantId, status: sub.status });
}

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const verifier = new Stripe("sk_test_placeholder");
  let event: Stripe.Event;
  try {
    event = verifier.webhooks.constructEvent(await req.text(), req.headers.get("stripe-signature") ?? "", secret);
  } catch {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  try {
    const outcome = await prisma.$transaction(async tx => {
      if (await tx.processedStripeEvent.findUnique({ where: { id: event.id } })) return "already";
      await tx.processedStripeEvent.create({ data: { id: event.id } });
      await applyEvent(tx, event);
      return "done";
    }, { timeout: 40000 });
    return NextResponse.json(outcome === "already" ? { received: true, alreadyProcessed: true } : { received: true });
  } catch (error) {
    // P2002 también puede ser un conflicto de customer: solo acusar duplicado
    // si el event.id quedó realmente confirmado por otra transacción.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      try {
        if (await prisma.processedStripeEvent.findUnique({ where: { id: event.id } })) {
          return NextResponse.json({ received: true, alreadyProcessed: true });
        }
      } catch { /* Responder 500 mantiene disponible el reintento de Stripe. */ }
    }
    logger.error("stripe_webhook_handler_error", { eventId: event.id, eventType: event.type, errorType: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ error: "handler_error" }, { status: 500 });
  }
}
