import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/ideas/:id/conversation
 *
 * Returns the (single) conversation associated with the idea, including its
 * messages in chronological order. Creates the conversation on-demand the
 * first time the idea is opened in the assistant.
 *
 * IDOR-guarded: only conversations belonging to the caller's restaurant are
 * returned. The idea itself is also scoped to the same restaurant.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth(req, "capture_idea");
  if (isNextResponse(ctx)) return ctx;
  if (!ctx.restaurantId)
    return NextResponse.json({ error: "Not in a restaurant" }, { status: 403 });

  const { id: ideaId } = await params;

  const idea = await prisma.idea.findUnique({
    where: { id: ideaId },
    select: { id: true, restaurantId: true },
  });
  if (!idea || idea.restaurantId !== ctx.restaurantId)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Default model for newly-created conversations: caller's preference.
  const me = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { defaultModel: true },
  });
  const defaultModel = me?.defaultModel ?? "sonnet";

  // Get-or-create. Race-safe via the unique index on Conversation.ideaId:
  // if two requests try to create simultaneously, the second hits P2002 and
  // we re-fetch the winner.
  let conversation = await prisma.conversation.findUnique({
    where: { ideaId },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        select: { id: true, role: true, content: true, createdAt: true },
      },
    },
  });

  if (!conversation) {
    try {
      conversation = await prisma.conversation.create({
        data: {
          restaurantId: ctx.restaurantId,
          authorId: ctx.userId,
          ideaId,
          modelUsed: defaultModel,
        },
        include: {
          messages: {
            orderBy: { createdAt: "asc" },
            select: { id: true, role: true, content: true, createdAt: true },
          },
        },
      });
      logger.info("conversation_created_for_idea", {
        conversationId: conversation.id,
        ideaId,
        restaurantId: ctx.restaurantId,
        userId: ctx.userId,
      });
    } catch (e) {
      // Likely P2002 unique conflict from a parallel request — re-read.
      const fallback = await prisma.conversation.findUnique({
        where: { ideaId },
        include: {
          messages: {
            orderBy: { createdAt: "asc" },
            select: { id: true, role: true, content: true, createdAt: true },
          },
        },
      });
      if (!fallback) throw e;
      conversation = fallback;
    }
  }

  return NextResponse.json({
    id: conversation.id,
    modelUsed: conversation.modelUsed,
    createdAt: conversation.createdAt.toISOString(),
    messages: conversation.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    })),
  });
}
