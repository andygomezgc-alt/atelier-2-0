import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { generateInviteCode } from "@atelier/shared";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";

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

  return NextResponse.json({ inviteCode: updated.inviteCode });
}
