import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const ctx = await requireAuth(req, "capture_idea");
  if (isNextResponse(ctx)) return ctx;
  if (!ctx.restaurantId)
    return NextResponse.json({ error: "Not in a restaurant" }, { status: 403 });
  const { id } = await params;
  const conversation = await prisma.conversation.findUnique({
    where: { id }, select: { restaurantId: true, authorId: true, generationId: true },
  });
  if (!conversation || conversation.restaurantId !== ctx.restaurantId)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (conversation.authorId !== ctx.userId && ctx.role !== "admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (conversation.generationId) await prisma.conversation.updateMany({
    // A delayed Stop must not clear a replacement turn that started after lookup.
    where: { id, restaurantId: ctx.restaurantId, generationId: conversation.generationId },
    data: { generationId: null, generationStartedAt: null },
  });
  return new NextResponse(null, { status: 204 });
}
