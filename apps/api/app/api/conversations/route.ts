import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { CreateConversationRequestSchema } from "@atelier/shared";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = await requireAuth(req);
  if (isNextResponse(ctx)) return ctx;
  if (!ctx.restaurantId)
    return NextResponse.json({ error: "Not in a restaurant" }, { status: 403 });

  const conversations = await prisma.conversation.findMany({
    where: { restaurantId: ctx.restaurantId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { idea: { select: { text: true } } },
  });

  return NextResponse.json(
    conversations.map((c) => ({
      id: c.id,
      modelUsed: c.modelUsed,
      ideaText: c.idea?.text ?? null,
      createdAt: c.createdAt.toISOString(),
    })),
  );
}

export async function POST(req: NextRequest) {
  const ctx = await requireAuth(req, "capture_idea");
  if (isNextResponse(ctx)) return ctx;

  const body = await req.json();
  const parse = CreateConversationRequestSchema.safeParse(body);
  if (!parse.success)
    return NextResponse.json({ error: parse.error.flatten() }, { status: 400 });

  // 1:1 between Idea and Conversation: if the idea already has a conversation
  // for this restaurant, return it instead of attempting to create a duplicate
  // (which would fail with P2002 on the unique ideaId index).
  if (parse.data.ideaId) {
    // IDOR guard: idea must belong to the caller's restaurant.
    const idea = await prisma.idea.findUnique({
      where: { id: parse.data.ideaId },
      select: { id: true, restaurantId: true },
    });
    if (!idea || idea.restaurantId !== ctx.restaurantId)
      return NextResponse.json({ error: "Idea not found" }, { status: 404 });

    const existing = await prisma.conversation.findUnique({
      where: { ideaId: parse.data.ideaId },
      select: { id: true },
    });
    if (existing) return NextResponse.json({ id: existing.id }, { status: 200 });
  }

  const conv = await prisma.conversation.create({
    data: {
      restaurantId: ctx.restaurantId,
      authorId: ctx.userId,
      modelUsed: parse.data.modelUsed,
      ideaId: parse.data.ideaId ?? null,
    },
  });

  if (parse.data.ideaId) {
    await prisma.idea.updateMany({
      where: { id: parse.data.ideaId, restaurantId: ctx.restaurantId },
      data: { status: "in_chat" },
    });
  }

  logger.info("conversation_created", {
    conversationId: conv.id,
    restaurantId: ctx.restaurantId,
    userId: ctx.userId,
    modelUsed: parse.data.modelUsed,
    ideaId: parse.data.ideaId ?? null,
  });
  return NextResponse.json({ id: conv.id }, { status: 201 });
}
