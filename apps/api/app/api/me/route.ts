import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma, Prisma } from "@atelier/db";
import { DeleteMeRequestSchema, PatchMeRequestSchema, type LeaveCase } from "@atelier/shared";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { projectMe, meSelect } from "@/lib/projections";
import { computeLeaveCase } from "@/lib/leave-cases";
import { deleteRestaurantRecords } from "@/lib/delete-restaurant";
import { deleteBlobs } from "@/lib/blob";
import { audit } from "@/lib/audit-log";
import { logger } from "@/lib/logger";
import { revokeAppleRefreshToken } from "@/lib/apple-auth";
import { decryptAppleToken } from "@/lib/apple-token-crypto";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = await requireAuth(req);
  if (isNextResponse(ctx)) return ctx;

  const user = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: meSelect,
  });

  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  return NextResponse.json(projectMe(user));
}

export async function PATCH(req: NextRequest) {
  const ctx = await requireAuth(req);
  if (isNextResponse(ctx)) return ctx;

  const body = await req.json();
  const parse = PatchMeRequestSchema.safeParse(body);
  if (!parse.success) {
    return NextResponse.json({ error: parse.error.flatten() }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: ctx.userId },
    data: parse.data,
    select: meSelect,
  });

  return NextResponse.json(projectMe(updated));
}

type DeleteCase = LeaveCase | "none";

async function withSerializableRetry<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) {
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 30_000,
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2034" &&
        attempt < MAX_ATTEMPTS
      ) {
        await new Promise((resolve) => setTimeout(resolve, 10 * attempt));
        continue;
      }
      throw err;
    }
  }
}

function deleteCaseChanged() {
  return NextResponse.json(
    { error: "La situación cambió; vuelve a revisar antes de eliminar la cuenta.", code: "case_changed" },
    { status: 409 },
  );
}

function confirmMismatch() {
  return NextResponse.json(
    { error: "El email no coincide.", code: "confirm_mismatch" },
    { status: 400 },
  );
}

function lastAdminBlocked() {
  return NextResponse.json(
    { error: "Transfiere el rol admin antes de eliminar la cuenta.", code: "last_admin" },
    { status: 409 },
  );
}

async function cancelStripeSubscriptionIdempotently(
  userId: string,
  subscriptionId: string,
): Promise<boolean> {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "sk_test_placeholder");
  const current = await stripe.subscriptions.retrieve(subscriptionId);
  if (current.status === "canceled") return false;

  await stripe.subscriptions.cancel(
    subscriptionId,
    {},
    { idempotencyKey: `delete-account:${userId}:${subscriptionId}` },
  );
  return true;
}

async function authoredCount(tx: Prisma.TransactionClient, userId: string): Promise<number> {
  const recipes = await tx.recipe.count({ where: { authorId: userId } });
  const ideas = await tx.idea.count({ where: { authorId: userId } });
  const conversations = await tx.conversation.count({ where: { authorId: userId } });
  const yieldTests = await tx.yieldTest.count({ where: { authorId: userId } });
  return recipes + ideas + conversations + yieldTests;
}

async function anonymizeUser(
  tx: Prisma.TransactionClient,
  user: { id: string; role: string; restaurantId: string | null },
) {
  if (user.restaurantId) {
    await audit(
      {
        restaurantId: user.restaurantId,
        actorId: user.id,
        action: "account_deleted",
        targetType: "User",
        targetId: user.id,
        payload: { previousRole: user.role },
      },
      tx,
    );
  }

  await tx.account.deleteMany({ where: { userId: user.id } });
  await tx.session.deleteMany({ where: { userId: user.id } });
  await tx.aiUsage.deleteMany({ where: { userId: user.id } });
  await tx.user.update({
    where: { id: user.id },
    data: {
      email: `deleted-${user.id}@deleted.atelier.invalid`,
      name: "—",
      photoUrl: null,
      bio: null,
      restaurantId: null,
      role: "viewer",
      tokenVersion: { increment: 1 },
    },
  });
}

export async function DELETE(req: NextRequest) {
  const ctx = await requireAuth(req);
  if (isNextResponse(ctx)) return ctx;

  const body = await req.json().catch(() => null);
  const parse = DeleteMeRequestSchema.safeParse(body);
  if (!parse.success) {
    return NextResponse.json({ error: parse.error.flatten() }, { status: 400 });
  }

  const originalUser = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: {
      email: true,
      photoUrl: true,
      restaurantId: true,
      accounts: {
        where: { provider: "apple" },
        select: { refresh_token: true },
      },
    },
  });
  if (!originalUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (parse.data.confirmEmail !== originalUser.email) return confirmMismatch();

  const expectedRestaurantId = originalUser.restaurantId;
  const expectedCase: DeleteCase = expectedRestaurantId
    ? (await computeLeaveCase(ctx.userId, expectedRestaurantId)).case
    : "none";
  // No external side effect (Stripe/Apple) is allowed when deletion is blocked.
  if (expectedCase === "B") return lastAdminBlocked();

  let restaurant:
    | {
        stripeSubscriptionId: string | null;
        photoUrl: string | null;
        menuStyleRefUrl: string | null;
      }
    | null = null;
  let stripeCanceledNow = false;

  if (expectedCase === "C" && expectedRestaurantId) {
    restaurant = await prisma.restaurant.findUnique({
      where: { id: expectedRestaurantId },
      select: { stripeSubscriptionId: true, photoUrl: true, menuStyleRefUrl: true },
    });
    if (!restaurant) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

  }

  // Revalida inmediatamente antes de cualquier llamada externa. No elimina la
  // imposibilidad teórica de una carrera, pero evita efectos si el caso ya cambió.
  if (expectedRestaurantId) {
    const preExternal = await computeLeaveCase(ctx.userId, expectedRestaurantId);
    if (preExternal.case !== expectedCase) return deleteCaseChanged();
  }

  if (expectedCase === "C" && expectedRestaurantId && restaurant?.stripeSubscriptionId) {
      try {
        stripeCanceledNow = await cancelStripeSubscriptionIdempotently(
          ctx.userId,
          restaurant.stripeSubscriptionId,
        );
      } catch (err) {
        logger.error("delete_account_stripe_cancel_failed", {
          restaurantId: expectedRestaurantId,
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

  // Apple asks apps that offer in-app deletion to revoke Sign in with Apple
  // tokens. Do this before deleting Account rows so a failure is recoverable.
  try {
    for (const account of originalUser.accounts) {
      if (!account.refresh_token) throw new Error("apple_refresh_token_missing");
      await revokeAppleRefreshToken(decryptAppleToken(account.refresh_token));
    }
  } catch (err) {
    logger.error("delete_account_apple_revoke_failed", {
      userId: ctx.userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      {
        error: stripeCanceledNow
          ? "No se pudo desconectar la cuenta de Apple. Tus datos siguen intactos, pero la suscripción ya quedó cancelada. Inténtalo de nuevo."
          : "No se pudo desconectar la cuenta de Apple; no se borraron tus datos. Inténtalo de nuevo.",
        code: stripeCanceledNow
          ? "apple_revoke_failed_after_stripe"
          : "apple_revoke_failed",
      },
      { status: 502 },
    );
  }

  const outcome = await withSerializableRetry(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: ctx.userId },
      select: { id: true, email: true, role: true, restaurantId: true },
    });
    if (!user) return { missing: true, mismatch: false, confirmMismatch: false };

    const actualCase: DeleteCase = user.restaurantId
      ? (await computeLeaveCase(user.id, user.restaurantId, tx)).case
      : "none";
    if (actualCase !== expectedCase || user.restaurantId !== expectedRestaurantId) {
      return { missing: false, mismatch: true, confirmMismatch: false };
    }
    if (user.email !== parse.data.confirmEmail) {
      return { missing: false, mismatch: false, confirmMismatch: true };
    }

    if (actualCase === "C" && user.restaurantId) {
      await deleteRestaurantRecords(tx, user.restaurantId);
      // El usuario puede conservar autoría (Restrict) en OTROS restaurantes
      // de los que salió antes (leave caso A): ahí user.delete lanza P2003.
      // Mismo guard que "none": con autoría remanente, anonimizar. El audit
      // se salta pasando restaurantId null — el restaurante ya no existe.
      if ((await authoredCount(tx, user.id)) > 0) {
        await anonymizeUser(tx, { id: user.id, role: user.role, restaurantId: null });
      } else {
        await tx.user.delete({ where: { id: user.id } });
      }
    } else if (actualCase === "A") {
      await anonymizeUser(tx, user);
    } else if ((await authoredCount(tx, user.id)) > 0) {
      await anonymizeUser(tx, user);
    } else {
      await tx.user.delete({ where: { id: user.id } });
    }

    await tx.verificationToken.deleteMany({ where: { identifier: originalUser.email } });
    return { missing: false, mismatch: false, confirmMismatch: false };
  });

  if (outcome.missing) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (outcome.mismatch) return deleteCaseChanged();
  if (outcome.confirmMismatch) return confirmMismatch();

  await deleteBlobs([
    originalUser.photoUrl,
    restaurant?.photoUrl,
    restaurant?.menuStyleRefUrl,
  ]);
  logger.info("account_deleted", { userId: ctx.userId, case: expectedCase });
  return new NextResponse(null, { status: 204 });
}
