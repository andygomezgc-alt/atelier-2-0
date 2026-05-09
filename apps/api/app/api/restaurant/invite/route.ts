import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { generateInviteCode } from "@atelier/shared/invite-code";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { audit } from "@/lib/audit-log";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ctx = await requireAuth(req, "manage_members");
  if (isNextResponse(ctx)) return ctx;

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: ctx.restaurantId },
  });
  if (!restaurant) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const newCode = generateInviteCode(restaurant.name);
  const updated = await prisma.restaurant.update({
    where: { id: restaurant.id },
    data: { inviteCode: newCode },
  });

  await audit({
    restaurantId: ctx.restaurantId,
    actorId: ctx.userId,
    action: "invite_regenerated",
  });

  return NextResponse.json({ inviteCode: updated.inviteCode });
}
