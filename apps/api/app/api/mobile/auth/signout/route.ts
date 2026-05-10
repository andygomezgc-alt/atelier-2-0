import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { audit } from "@/lib/audit-log";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ctx = await requireAuth(req);
  if (isNextResponse(ctx)) return ctx;

  await prisma.user.update({
    where: { id: ctx.userId },
    data: { tokenVersion: { increment: 1 } },
  });

  if (ctx.restaurantId) {
    await audit({
      restaurantId: ctx.restaurantId,
      actorId: ctx.userId,
      action: "token_revoked",
    });
  }

  return NextResponse.json({ ok: true });
}
