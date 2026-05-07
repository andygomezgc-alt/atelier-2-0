import { NextRequest } from "next/server";
import { prisma } from "@atelier/db";
import { PostMessageRequestSchema } from "@atelier/shared";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { buildSystemBlocks, streamMessage, type Msg } from "@/lib/anthropic";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth(req);
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
    select: { id: true, role: true, content: true, createdAt: true },
  });

  return Response.json(
    messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    })),
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth(req, "capture_idea");
  if (isNextResponse(ctx)) return ctx;
  if (!ctx.restaurantId)
    return new Response(JSON.stringify({ error: "Not in a restaurant" }), { status: 403 });
  const { id: conversationId } = await params;

  const body = await req.json();
  const parse = PostMessageRequestSchema.safeParse(body);
  if (!parse.success)
    return new Response(JSON.stringify({ error: parse.error.flatten() }), { status: 400 });

  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { idea: { select: { text: true } } },
  });
  if (!conv || conv.restaurantId !== ctx.restaurantId)
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });

  // Persist user message before streaming.
  await prisma.message.create({
    data: {
      conversationId,
      role: "user",
      content: parse.data.content,
    },
  });

  // Build context: recent recipes + pinned idea.
  const [restaurant, recentRecipes, history] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { id: ctx.restaurantId },
      select: { name: true, identityLine: true },
    }),
    prisma.recipe.findMany({
      where: { restaurantId: ctx.restaurantId },
      orderBy: { updatedAt: "desc" },
      take: 8,
      select: { title: true, state: true },
    }),
    prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      select: { role: true, content: true },
    }),
  ]);

  if (!restaurant)
    return new Response(JSON.stringify({ error: "Restaurant not found" }), { status: 404 });

  const messages: Msg[] = history
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  const system = buildSystemBlocks(restaurant, recentRecipes, conv.idea?.text ?? null);
  const model = parse.data.model ?? (conv.modelUsed === "opus" ? "opus" : "sonnet");

  const start = Date.now();

  // SSE stream
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let assistantText = "";
      let inputTokens: number | undefined;
      let outputTokens: number | undefined;
      let cachedTokens: number | undefined;

      try {
        const anthroStream = streamMessage({ model, system, messages });

        for await (const event of anthroStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            assistantText += event.delta.text;
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "delta", text: event.delta.text })}\n\n`,
              ),
            );
          }
        }

        const final = await anthroStream.finalMessage();
        inputTokens = final.usage.input_tokens;
        outputTokens = final.usage.output_tokens;
        cachedTokens = final.usage.cache_read_input_tokens ?? 0;

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "done",
              inputTokens,
              outputTokens,
              cachedTokens,
            })}\n\n`,
          ),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "stream error";
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", message })}\n\n`));
      } finally {
        // Persist final assistant message + telemetry.
        if (assistantText) {
          await prisma.message.create({
            data: {
              conversationId,
              role: "assistant",
              content: assistantText,
              inputTokens: inputTokens ?? null,
              outputTokens: outputTokens ?? null,
              cachedTokens: cachedTokens ?? null,
              latencyMs: Date.now() - start,
            },
          });
        }
        // Log per-message telemetry to server stdout (brief sec. 10).
        console.log(
          JSON.stringify({
            evt: "anthropic_message",
            model,
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            cached_tokens: cachedTokens,
            latency_ms: Date.now() - start,
          }),
        );
        controller.close();
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
