import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@atelier/db";
import type { PlanTier, PlanStatus } from "@atelier/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// Instanciado solo para verificar la firma del webhook; NO llamamos a la API
// de Stripe desde acá, así que el placeholder alcanza cuando no hay secret.
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "sk_test_placeholder");

const PLAN_TIERS = ["pilot", "founder", "early", "pro"] as const;

function toPlanTier(v: unknown): PlanTier | null {
  return typeof v === "string" && (PLAN_TIERS as readonly string[]).includes(v)
    ? (v as PlanTier)
    : null;
}

// Stripe devuelve customer/subscription como id string o como objeto expandido.
function idOf(v: string | { id: string } | null | undefined): string | null {
  if (!v) return null;
  return typeof v === "string" ? v : v.id;
}

// Enlazamos el restaurante por subscription primero, customer como fallback.
async function findRestaurantId(
  subscriptionId: string | null,
  customerId: string | null,
): Promise<{ id: string; graceUntil: Date | null } | null> {
  if (subscriptionId) {
    const r = await prisma.restaurant.findFirst({
      where: { stripeSubscriptionId: subscriptionId },
      select: { id: true, graceUntil: true },
    });
    if (r) return r;
  }
  if (customerId) {
    const r = await prisma.restaurant.findFirst({
      where: { stripeCustomerId: customerId },
      select: { id: true, graceUntil: true },
    });
    if (r) return r;
  }
  return null;
}

// Mapea el status de la suscripción de Stripe a nuestros campos de plan.
// null = status intermedio (incomplete / paused): no tocamos el plan.
function planDataFromSubscription(
  sub: Stripe.Subscription,
  currentGraceUntil: Date | null,
): { planStatus: PlanStatus; trialEndsAt?: Date | null; graceUntil?: Date | null } | null {
  switch (sub.status) {
    case "active":
      // Un pago recuperado cierra la ventana de gracia.
      return { planStatus: "active", graceUntil: null };
    case "trialing":
      return {
        planStatus: "trial",
        trialEndsAt: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
      };
    case "past_due":
      return {
        planStatus: "past_due",
        graceUntil: currentGraceUntil ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      };
    case "canceled":
    case "unpaid":
    case "incomplete_expired":
      return { planStatus: "canceled" };
    default:
      return null;
  }
}

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    logger.error("stripe_webhook_not_configured");
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature ?? "", secret);
  } catch (err) {
    logger.warn("stripe_webhook_bad_signature", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        // client_reference_id lo mandamos en el Payment Link = restaurantId.
        const restaurantId = session.client_reference_id;
        if (!restaurantId) {
          logger.warn("stripe_checkout_no_reference", { eventId: event.id });
          return NextResponse.json({ received: true });
        }
        const plan = toPlanTier(session.metadata?.plan) ?? "pro";
        const res = await prisma.restaurant.updateMany({
          where: { id: restaurantId },
          data: {
            stripeCustomerId: idOf(session.customer),
            stripeSubscriptionId: idOf(session.subscription),
            planStatus: "active",
            plan,
            graceUntil: null,
          },
        });
        if (res.count === 0) {
          logger.warn("stripe_checkout_restaurant_not_found", { restaurantId, eventId: event.id });
          return NextResponse.json({ received: true });
        }
        logger.info("stripe_checkout_completed", { restaurantId, plan });
        return NextResponse.json({ received: true });
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const found = await findRestaurantId(sub.id, idOf(sub.customer));
        if (!found) {
          logger.warn("stripe_subscription_restaurant_not_found", {
            subscriptionId: sub.id,
            eventId: event.id,
          });
          return NextResponse.json({ received: true });
        }
        const data = planDataFromSubscription(sub, found.graceUntil);
        if (!data) {
          // Status intermedio: no cambiamos nada, solo acusamos recibo.
          return NextResponse.json({ received: true });
        }
        await prisma.restaurant.update({ where: { id: found.id }, data });
        logger.info("stripe_subscription_updated", {
          restaurantId: found.id,
          planStatus: data.planStatus,
        });
        return NextResponse.json({ received: true });
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const found = await findRestaurantId(sub.id, idOf(sub.customer));
        if (!found) {
          logger.warn("stripe_subscription_restaurant_not_found", {
            subscriptionId: sub.id,
            eventId: event.id,
          });
          return NextResponse.json({ received: true });
        }
        await prisma.restaurant.update({
          where: { id: found.id },
          data: { planStatus: "canceled" },
        });
        logger.info("stripe_subscription_deleted", { restaurantId: found.id });
        return NextResponse.json({ received: true });
      }

      default:
        return NextResponse.json({ received: true });
    }
  } catch (err) {
    logger.error("stripe_webhook_handler_error", {
      eventType: event.type,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "handler_error" }, { status: 500 });
  }
}
