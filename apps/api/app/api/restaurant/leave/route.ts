// Gestión de equipo F3 — POST /api/restaurant/leave
//
// El body { expectedCase, confirmName? } lleva el caso que el usuario confirmó
// en el preflight. El server RECOMPUTA el caso dentro de una transacción
// serializable y, si no coincide, responde 409 `case_changed` sin tocar nada
// (P1-1: cierra la carrera "salir se convierte en borrar todo sin
// confirmación"). Casos:
//   A: User.restaurantId = null + audit "staff_left" → 200 {action:"left"}
//   C: exige confirmName === nombre exacto del restaurante; borra el
//      restaurante (15 DELETEs en orden topológico) → 200 {action:"deleted"}.
//      Si hay suscripción de Stripe se cancela ANTES de borrar (P2-7); si la
//      cancelación falla → 502 y NO se borra (mejor eso que un cobro fantasma).
//   B: (único admin con más miembros) nunca se pide desde el cliente — el
//      preflight lo bloquea. Si el recompute lo detecta → case_changed.

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma, Prisma } from "@atelier/db";
import { LeaveRequestSchema, type LeaveCase } from "@atelier/shared";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { computeLeaveCase } from "@/lib/leave-cases";
import { audit } from "@/lib/audit-log";
import { logger } from "@/lib/logger";
import { deleteBlobs } from "@/lib/blob";
import { deleteRestaurantRecords } from "@/lib/delete-restaurant";

export const dynamic = "force-dynamic";

// P1-2: reintenta la transacción ante un conflicto de serialización (P2034).
// El nivel Serializable es lo que convierte las carreras de "último admin" /
// "último miembro" en un conflicto detectable en vez de un caso mal calculado
// (dos transacciones que leen membresías solapadas se serializan o una aborta).
async function withSerializableRetry<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: { timeout?: number },
): Promise<T> {
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        ...(options?.timeout ? { timeout: options.timeout } : {}),
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2034" &&
        attempt < MAX_ATTEMPTS
      ) {
        await new Promise((r) => setTimeout(r, 10 * attempt));
        continue;
      }
      throw err;
    }
  }
}

function caseChanged(actualCase: LeaveCase) {
  return NextResponse.json(
    { error: "La situación cambió; vuelve a revisar antes de salir.", code: "case_changed", actualCase },
    { status: 409 },
  );
}

export async function POST(req: NextRequest) {
  const ctx = await requireAuth(req);
  if (isNextResponse(ctx)) return ctx;
  if (!ctx.restaurantId) {
    return NextResponse.json({ error: "Not in a restaurant" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parse = LeaveRequestSchema.safeParse(body);
  if (!parse.success) {
    return NextResponse.json({ error: parse.error.flatten() }, { status: 400 });
  }
  const { expectedCase, confirmName } = parse.data;
  const restaurantId = ctx.restaurantId;

  // ───────────────────────────── Caso A: salir ─────────────────────────────
  if (expectedCase === "A") {
    const outcome = await withSerializableRetry<{ mismatch: LeaveCase | null }>(
      async (tx) => {
        const c = await computeLeaveCase(ctx.userId, restaurantId, tx);
        if (c.case !== "A") return { mismatch: c.case };

        const previousRole = (
          await tx.user.findUnique({
            where: { id: ctx.userId },
            select: { role: true },
          })
        )?.role;

        await tx.user.update({
          where: { id: ctx.userId },
          data: { restaurantId: null },
        });

        await audit(
          {
            restaurantId,
            actorId: ctx.userId,
            action: "staff_left",
            targetType: "User",
            targetId: ctx.userId,
            payload: { previousRole },
          },
          tx,
        );

        return { mismatch: null };
      },
    );
    if (outcome.mismatch) return caseChanged(outcome.mismatch);
    return NextResponse.json({ action: "left" });
  }

  // ─────────────────────── Caso C: borrar el restaurante ───────────────────
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      name: true,
      stripeSubscriptionId: true,
      photoUrl: true,
      menuStyleRefUrl: true,
    },
  });
  if (!restaurant) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // Confirmación server-side del borrado destructivo: nombre exacto. La UI ya
  // lo exige, pero el server nunca debe confiar en eso (P1-1).
  if (confirmName !== restaurant.name) {
    return NextResponse.json(
      { error: "El nombre no coincide.", code: "confirm_name_mismatch" },
      { status: 400 },
    );
  }

  // P2-7: si hay suscripción, cancelarla en Stripe ANTES de borrar. Mejor no
  // borrar (dejar el restaurante intacto) que borrarlo y seguir cobrando un
  // fantasma. En el pilot (sin Stripe) `stripeSubscriptionId` es null y esto no
  // se ejecuta nunca.
  if (restaurant.stripeSubscriptionId) {
    // Guarda contra una cancelación indebida: si alguien entró justo ahora ya
    // no soy el último miembro → no cancelo ni borro. El re-chequeo autoritativo
    // vuelve a correr dentro de la tx; esta comprobación evita tocar Stripe en
    // el caso común de "la situación ya cambió". Queda una ventana mínima entre
    // esta comprobación y la tx en la que un join concurrente cancelaría la
    // suscripción sin borrar — aceptada como mal menor frente al cobro fantasma.
    const pre = await computeLeaveCase(ctx.userId, restaurantId);
    if (pre.case !== "C") return caseChanged(pre.case);
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "sk_test_placeholder");
      await stripe.subscriptions.cancel(restaurant.stripeSubscriptionId);
    } catch (err) {
      logger.error("leave_stripe_cancel_failed", {
        restaurantId,
        subscriptionId: restaurant.stripeSubscriptionId,
        error: err instanceof Error ? err.message : String(err),
      });
      return NextResponse.json(
        {
          error: "No se pudo cancelar la suscripción; no se borró nada. Inténtalo de nuevo.",
          code: "stripe_cancel_failed",
        },
        { status: 502 },
      );
    }
  }

  // Orden topológico de los 15 DELETEs (validado por dry-run F3-C, evita los
  // cinco onDelete=Restrict). P2-8: timeout de 30 s. El recompute DENTRO de la
  // tx serializable aborta con case_changed si aparecieron miembros nuevos
  // (carrera join‖borrado, variante espejo de P1-1).
  let mismatch: LeaveCase | null = null;
  await withSerializableRetry(
    async (tx) => {
      const c = await computeLeaveCase(ctx.userId, restaurantId, tx);
      if (c.case !== "C") {
        mismatch = c.case;
        return;
      }
      await deleteRestaurantRecords(tx, restaurantId);
    },
    { timeout: 30_000 },
  );
  if (mismatch) return caseChanged(mismatch);

  await deleteBlobs([restaurant.photoUrl, restaurant.menuStyleRefUrl]);

  logger.info("restaurant_deleted", { restaurantId, actorId: ctx.userId });
  return NextResponse.json({ action: "deleted" });
}
