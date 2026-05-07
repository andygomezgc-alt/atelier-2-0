import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { PatchStaffMemberRequestSchema } from "@atelier/shared";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const ctx = await requireAuth(req, "change_role");
  if (isNextResponse(ctx)) return ctx;
  const { userId } = await params;

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target || target.restaurantId !== ctx.restaurantId)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (target.id === ctx.userId)
    return NextResponse.json({ error: "Cannot change your own role" }, { status: 400 });

  const body = await req.json();
  const parse = PatchStaffMemberRequestSchema.safeParse(body);
  if (!parse.success)
    return NextResponse.json({ error: parse.error.flatten() }, { status: 400 });

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { role: parse.data.role },
    select: { id: true, role: true },
  });

  return NextResponse.json({ id: updated.id, role: updated.role });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const ctx = await requireAuth(req, "manage_members");
  if (isNextResponse(ctx)) return ctx;
  const { userId } = await params;

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target || target.restaurantId !== ctx.restaurantId)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (target.id === ctx.userId)
    return NextResponse.json({ error: "Cannot remove yourself" }, { status: 400 });

  await prisma.user.update({
    where: { id: userId },
    data: { restaurantId: null },
  });

  return NextResponse.json({ ok: true });
}
