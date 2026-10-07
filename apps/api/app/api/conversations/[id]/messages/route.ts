import { after, NextRequest } from "next/server";
import { prisma } from "@atelier/db";
import { PostMessageRequestSchema, can } from "@atelier/shared";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { prepareChatTurn, runChatTurn } from "@/lib/chat-turn-service";
import { CHAT_HEARTBEAT_MS } from "@/lib/chat-turn";
import { ChatError } from "@/lib/ai/chat";
import { logger } from "@/lib/logger";

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
  const startedAt = Date.now();
  // Leave fifteen seconds for persistence, billing and fenced lease cleanup.
  const deadlineAt = startedAt + (maxDuration - 15) * 1_000;
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

  const generation = new AbortController();
  const deadline = setTimeout(() => generation.abort(new ChatError("ai_timeout")), Math.max(0, deadlineAt - Date.now()));
  let prepared: Awaited<ReturnType<typeof prepareChatTurn>>;
  try {
    prepared = await prepareChatTurn({
      conversationId, user: ctx, message: parse.data, signal: req.signal,
      generationSignal: generation.signal, startedAt, deadlineAt,
    });
  } catch (error) {
    clearTimeout(deadline);
    logger.error("ai_turn_preparation_failed", { error });
    return Response.json({ error: "ai_provider_failed", code: "ai_provider_failed" }, { status: 503 });
  }
  if (prepared instanceof Response) { clearTimeout(deadline); return prepared; }

  // HTTP mirrors one independently running promise; it never owns cancellation.
  let connected = !req.signal.aborted;
  const disconnect = () => { connected = false; };
  req.signal.addEventListener("abort", disconnect, { once: true });
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(output) { controller = output; },
    cancel: disconnect,
  });
  const mirror = (event: unknown) => {
    if (!connected || !controller) return;
    try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)); }
    catch { disconnect(); } // A closed transport must never stop the generator.
  };
  const heartbeat = setInterval(() => mirror({ type: "heartbeat", ts: Date.now() }), CHAT_HEARTBEAT_MS);
  const completion = (async () => {
    try {
      for await (const event of runChatTurn(prepared, generation.signal)) mirror(event);
    } finally {
      clearInterval(heartbeat); clearTimeout(deadline);
      req.signal.removeEventListener("abort", disconnect);
      try { controller?.close(); } catch { /* The response was already cancelled. */ }
    }
  })();
  try { after(completion); }
  catch (error) {
    // A host without waitUntil cannot safely dispatch an untracked generation.
    generation.abort(new ChatError("ai_provider_failed", { cause: error }));
    await completion;
    logger.error("ai_background_registration_failed", { error });
    return Response.json({ error: "ai_provider_failed", code: "ai_provider_failed" }, { status: 503 });
  }
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
