import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";

export const dynamic = "force-dynamic";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth(req);
  if (isNextResponse(ctx)) return ctx;
  if (!ctx.restaurantId)
    return NextResponse.json({ error: "Not in a restaurant" }, { status: 403 });
  const { id } = await params;

  const conv = await prisma.conversation.findUnique({
    where: { id },
    select: { id: true, restaurantId: true, authorId: true },
  });
  if (!conv || conv.restaurantId !== ctx.restaurantId)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (conv.authorId !== ctx.userId && ctx.role !== "admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.conversation.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
