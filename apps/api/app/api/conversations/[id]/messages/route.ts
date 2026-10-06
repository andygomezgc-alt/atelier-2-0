import { NextRequest } from "next/server";
import { prisma } from "@atelier/db";
import { PostMessageRequestSchema, can } from "@atelier/shared";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { prepareChatTurn, runChatTurn } from "@/lib/chat-turn-service";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth(req, "capture_idea");
  if (isNextResponse(ctx)) return ctx;
  if (!ctx.restaurantId)
    return new Response(JSON.stringify({ error: "Not in a restaurant" }), { status: 403 });
  const { id } = await params;

  const conv = await prisma.conversation.findUnique({ where: { id } });
  if (!conv || conv.restaurantId !== ctx.restaurantId)
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });

  const messages = await prisma.message.findMany({
    where: { conversationId: id },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, content: true, createdAt: true, clientMessageId: true },
  });

  return Response.json(
    messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      clientMessageId: m.clientMessageId,
      createdAt: m.createdAt.toISOString(),
    })),
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: conversationId } = await params;
  const isPreview = conversationId === "preview";
  const ctx = isPreview
    ? await requireAuth(req)
    : await requireAuth(req, "capture_idea");
  if (isNextResponse(ctx)) return ctx;
  if (!isPreview && !ctx.restaurantId)
    return new Response(JSON.stringify({ error: "Not in a restaurant" }), { status: 403 });
  if (isPreview && ctx.restaurantId && !can(ctx.role, "capture_idea"))
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parse = PostMessageRequestSchema.safeParse(body);
  if (!parse.success)
    return new Response(JSON.stringify({ error: parse.error.flatten() }), { status: 400 });

  const downstream = new AbortController();
  const signal = AbortSignal.any([req.signal, downstream.signal]);
  const prepared = await prepareChatTurn({ conversationId, user: ctx, message: parse.data, signal });
  if (prepared instanceof Response) return prepared;

  // HTTP owns transport only; the service owns generation, persistence and cleanup.
  const stream = new ReadableStream<Uint8Array>({
    cancel() { downstream.abort(); },
    async start(controller) {
      const encoder = new TextEncoder();
      const heartbeatInterval = setInterval(() => {
        if (signal.aborted) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "heartbeat", ts: Date.now() })}\n\n`));
        } catch { /* The client disconnected; finally stops the heartbeat. */ }
      }, 8_000);
      try {
        for await (const event of runChatTurn(prepared, signal)) {
          if (event.type === "done" || event.type === "error") clearInterval(heartbeatInterval);
          if (signal.aborted) break;
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          } catch {
            downstream.abort();
            break;
          }
        }
      } finally {
        clearInterval(heartbeatInterval);
        try { controller.close(); } catch { /* The stream was already cancelled. */ }
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
