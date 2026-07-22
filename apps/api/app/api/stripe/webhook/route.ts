import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma, Prisma } from "@atelier/db";
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
// Recibe el cliente `db` (prisma o el tx de la transacción) para leer dentro
// de la misma transacción que aplica los cambios.
async function findRestaurantId(
  db: Prisma.TransactionClient,
  subscriptionId: string | null,
  customerId: string | null,
): Promise<{ id: string; graceUntil: Date | null } | null> {
  if (subscriptionId) {
    const r = await db.restaurant.findFirst({
      where: { stripeSubscriptionId: subscriptionId },
      select: { id: true, graceUntil: true },
    });
    if (r) return r;
  }
  if (customerId) {
    const r = await db.restaurant.findFirst({
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

// Aplica el efecto de negocio del evento sobre el cliente `tx`. Corre DENTRO de
// la transacción de idempotencia: si algo acá tira, la tx revierte también el
// processedStripeEvent y Stripe reintentará el evento entero.
// Los casos "sin referencia / restaurante no encontrado / status intermedio" NO
// tiran: retornan y dejan que la tx confirme (reintentar no ayudaría, el evento
// queda consumido). Antes estos casos hacían `return NextResponse.json(...)`
// dentro del switch; ahora son `return` a secas y la respuesta se arma afuera.
// TODO(ordering): no ordenamos por event.created. Si Stripe entrega un
// customer.subscription.updated viejo después de uno nuevo, podría pisar el
// estado con datos rancios. Fuera de alcance de esta ronda de estabilización.
async function applyEvent(
  tx: Prisma.TransactionClient,
  event: Stripe.Event,
): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      // client_reference_id lo mandamos en el Payment Link = restaurantId.
      const restaurantId = session.client_reference_id;
      if (!restaurantId) {
        logger.warn("stripe_checkout_no_reference", { eventId: event.id });
        return;
      }
      const plan = toPlanTier(session.metadata?.plan) ?? "pro";
      const res = await tx.restaurant.updateMany({
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
        return;
      }
      logger.info("stripe_checkout_completed", { restaurantId, plan });
      return;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const found = await findRestaurantId(tx, sub.id, idOf(sub.customer));
      if (!found) {
        logger.warn("stripe_subscription_restaurant_not_found", {
          subscriptionId: sub.id,
          eventId: event.id,
        });
        return;
      }
      const data = planDataFromSubscription(sub, found.graceUntil);
      if (!data) {
        // Status intermedio: no cambiamos nada, solo acusamos recibo afuera.
        return;
      }
      await tx.restaurant.update({ where: { id: found.id }, data });
      logger.info("stripe_subscription_updated", {
        restaurantId: found.id,
        planStatus: data.planStatus,
      });
      return;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const found = await findRestaurantId(tx, sub.id, idOf(sub.customer));
      if (!found) {
        logger.warn("stripe_subscription_restaurant_not_found", {
          subscriptionId: sub.id,
          eventId: event.id,
        });
        return;
      }
      await tx.restaurant.update({
        where: { id: found.id },
        data: { planStatus: "canceled" },
      });
      logger.info("stripe_subscription_deleted", { restaurantId: found.id });
      return;
    }

    default:
      return;
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

  // Idempotencia ATÓMICA (estabilización jul 2026). Marcar el evento como
  // procesado y aplicar el cambio de negocio ocurren en la MISMA transacción:
  // - Éxito → ambos commitean juntos.
  // - Fallo de negocio → la tx revierte TAMBIÉN el processedStripeEvent, así que
  //   el retry de Stripe vuelve a aplicarlo (antes el evento quedaba "consumido"
  //   por el create previo al switch y el cambio se perdía para siempre).
  // - Carrera de dos entregas del mismo evento → el segundo create choca con
  //   P2002, aborta su tx y lo tratamos como duplicado (acuse sin reprocesar).
  try {
    const outcome = await prisma.$transaction(async (tx) => {
      const dup = await tx.processedStripeEvent.findUnique({ where: { id: event.id } });
      if (dup) return "already" as const;
      await tx.processedStripeEvent.create({ data: { id: event.id } });
      await applyEvent(tx, event);
      return "done" as const;
    });

    if (outcome === "already") {
      logger.info("stripe_webhook_already_processed", {
        eventId: event.id,
        eventType: event.type,
      });
      return NextResponse.json({ received: true, alreadyProcessed: true });
    }
    return NextResponse.json({ received: true });
  } catch (err) {
    // Carrera concurrente: dos requests del mismo evento pasan el findUnique a la
    // vez y el segundo create tira P2002 → su tx aborta. Igual que un duplicado:
    // acusamos recibo sin reprocesar (el otro request ya lo aplicó/lo aplicará).
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      logger.info("stripe_webhook_already_processed", {
        eventId: event.id,
        eventType: event.type,
        concurrent: true,
      });
      return NextResponse.json({ received: true, alreadyProcessed: true });
    }
    // Fallo real (negocio o infra): la tx revirtió el processedStripeEvent, así
    // que respondemos 500 y Stripe reintentará el evento entero.
    logger.error("stripe_webhook_handler_error", {
      eventType: event.type,
      eventId: event.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "handler_error" }, { status: 500 });
  }
}
