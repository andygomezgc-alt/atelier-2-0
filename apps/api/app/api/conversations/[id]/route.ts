import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { logger } from "@/lib/logger";
import { canAccessConversation } from "@/lib/conversation-access";

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
    select: { id: true, restaurantId: true, authorId: true, ideaId: true, idea: { select: { authorId: true } } },
  });
  if (!conv || conv.restaurantId !== ctx.restaurantId || !canAccessConversation(conv, ctx))
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Shared chats stay deletable only by their author or an admin; the team can see them, so 403 leaks nothing.
  if (conv.ideaId === null && conv.authorId !== ctx.userId && ctx.role !== "admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.conversation.delete({ where: { id } });
  logger.info("conversation_deleted", { conversationId: id, userId: ctx.userId });
  return new NextResponse(null, { status: 204 });
}
