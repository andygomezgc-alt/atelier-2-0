import { randomUUID } from "node:crypto";
import { prisma } from "@atelier/db";

export type ChatTurn = { conversationId: string; generationId: string; userMessageId: string };
const headers = { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform" };

export async function releaseChatTurn(turn: Pick<ChatTurn, "conversationId" | "generationId">) {
  await prisma.conversation.updateMany({ where: { id: turn.conversationId, generationId: turn.generationId }, data: { generationId: null, generationStartedAt: null } });
}

export async function beginChatTurn(conversationId: string, restaurantId: string, content: string, clientMessageId?: string): Promise<ChatTurn | Response> {
  const generationId = randomUUID();
  const claim = await prisma.conversation.updateMany({ where: {
    id: conversationId, restaurantId,
    OR: [{ generationId: null }, { generationStartedAt: { lt: new Date(Date.now() - 10 * 60_000) } }],
  }, data: { generationId, generationStartedAt: new Date() } });
  if (!claim.count) return Response.json({ error: "chat_in_progress", code: "chat_in_progress" }, { status: 409, headers: { "Retry-After": "5" } });
  const turn = { conversationId, generationId };
  let keepLease = false;
  try {
    const prior = clientMessageId ? await prisma.message.findUnique({ where: { conversationId_clientMessageId: { conversationId, clientMessageId } } }) : null;
    if (prior && (prior.role !== "user" || prior.content !== content)) {
      return Response.json({ error: "chat_request_conflict", code: "chat_request_conflict" }, { status: 409 });
    }
    if (prior) {
      const response = await prisma.message.findUnique({ where: { responseToId: prior.id } });
      if (response) {
        return new Response(`data: ${JSON.stringify({ type: "delta", text: response.content })}\n\ndata: ${JSON.stringify({ type: "done", messageId: response.id, replayed: true })}\n\n`, { headers });
      }
      const latest = await prisma.message.findFirst({ where: { conversationId }, orderBy: { createdAt: "desc" }, select: { id: true } });
      if (latest?.id !== prior.id) return Response.json({ error: "chat_request_conflict", code: "chat_request_conflict" }, { status: 409 });
    }
    // streamChat reserves the user's weekly allowance and shared budget before
    // contacting the provider. Replays above never reserve another generation.
    const message = prior ?? await prisma.message.create({ data: { conversationId, role: "user", content, ...(clientMessageId ? { clientMessageId } : {}) } });
    keepLease = true;
    return { ...turn, userMessageId: message.id };
  } finally {
    if (!keepLease) await releaseChatTurn(turn);
  }
}

export async function finishChatTurn(turn: ChatTurn, content: string, modelId: string, usage: { inputTokens?: number; outputTokens?: number; cachedTokens?: number; latencyMs: number }) {
  return prisma.$transaction(async tx => {
    // Fencing: an expired worker cannot save over a newer generation.
    const owner = await tx.conversation.updateMany({ where: { id: turn.conversationId, generationId: turn.generationId }, data: { generationId: null, generationStartedAt: null } });
    if (!owner.count) throw new Error("chat_generation_expired");
    return tx.message.create({ data: { conversationId: turn.conversationId, role: "assistant", content,
      responseToId: turn.userMessageId, modelId, inputTokens: usage.inputTokens ?? null, outputTokens: usage.outputTokens ?? null,
      cachedTokens: usage.cachedTokens ?? null, latencyMs: usage.latencyMs } });
  });
}
