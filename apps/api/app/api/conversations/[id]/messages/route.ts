import { NextRequest } from "next/server";
import { chatMemory } from "@/lib/culinary-memory/service";
import { prisma } from "@atelier/db";
import { PostMessageRequestSchema, can } from "@atelier/shared";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { buildSystemBlocks, type Msg } from "@/lib/anthropic";
import { recordAiTokens } from "@/lib/ai-quota";

import { streamChat } from "@/lib/ai/chat";
import { chatConfig, providerConfigured } from "@/lib/ai/config";

import { beginChatTurn, finishChatTurn, releaseChatTurn, type ChatTurn } from "@/lib/chat-turn";

export const maxDuration = 300;
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
  // A-12 — el chef en estado needs-restaurant también puede usar el Asistente.
  // El cliente apunta a `/api/conversations/preview/messages` cuando todavía
  // no tiene restaurante. Acá ni buscamos Conversation ni persistimos nada;
  // el historial vive en memoria del cliente y nos lo manda en `body.history`.
  // Al "Guardar como receta" se crea el restaurante (lazy), luego la
  // Conversation real y se hidrata vía /messages/bulk en una sola llamada.
  const isPreview = conversationId === "preview";

  const ctx = isPreview
    ? await requireAuth(req)
    : await requireAuth(req, "capture_idea");
  if (isNextResponse(ctx)) return ctx;
  if (!isPreview && !ctx.restaurantId)
    return new Response(JSON.stringify({ error: "Not in a restaurant" }), { status: 403 });

  if (isPreview && ctx.restaurantId && !can(ctx.role, "capture_idea")) return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parse = PostMessageRequestSchema.safeParse(body);
  if (!parse.success)
    return new Response(JSON.stringify({ error: parse.error.flatten() }), { status: 400 });

  const model = parse.data.model ?? "daily";
  const config = chatConfig(model);
  if (!providerConfigured(config.provider)) return Response.json({
    error: "El asistente todavía no está configurado. Inténtalo más tarde.", code: "ai_provider_unconfigured",
  }, { status: 503 });

  let restaurant: { name: string; identityLine: string | null } | null = null;
  let recentRecipes: { title: string; state: string }[] = [];
  let messages: Msg[] = [];
  let pinnedIdeaText: string | null = null;

  let turn: ChatTurn | undefined;
  try {
  if (isPreview) {
    // Restaurante placeholder — el chef todavía no le puso nombre.
    restaurant = { name: "Tu cocina", identityLine: null };

    // El cliente manda `history: [{ role, content }, ...]` con los últimos
    // mensajes acumulados localmente (incluye el user msg actual ya pusheado
    // o no — defensivo).
    const rawHistory = Array.isArray((body as { history?: unknown }).history)
      ? ((body as { history: unknown[] }).history as unknown[])
      : [];
    messages = rawHistory
      .filter((m): m is { role: string; content: string } => {
        if (typeof m !== "object" || m === null) return false;
        const r = (m as { role?: unknown }).role;
        const c = (m as { content?: unknown }).content;
        return (r === "user" || r === "assistant") && typeof c === "string";
      })
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))
      .slice(-20);
    // Si el último mensaje no es el `content` que viene en este request,
    // lo agregamos al final (cliente correcto debería ya incluirlo).
    const last = messages[messages.length - 1];
    if (!last || last.role !== "user" || last.content !== parse.data.content) {
      messages.push({ role: "user", content: parse.data.content });
    }

  } else {
    const conv = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { idea: { select: { text: true } } },
    });
    if (!conv || conv.restaurantId !== ctx.restaurantId)
      return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });

    pinnedIdeaText = conv.idea?.text ?? null;

    const started = await beginChatTurn(conversationId, ctx.restaurantId, parse.data.content, parse.data.clientMessageId);
    if (started instanceof Response) return started;
    turn = started;

    // Build context: recent recipes + pinned idea.
    const [r, recent, history] = await Promise.all([
      prisma.restaurant.findUnique({
        where: { id: ctx.restaurantId },
        select: { name: true, identityLine: true },
      }),
      prisma.recipe.findMany({
        where: { restaurantId: ctx.restaurantId, deletedAt: null },
        orderBy: { updatedAt: "desc" },
        take: 8,
        select: { title: true, state: true },
      }),
      // Sliding window: solo re-enviamos los últimos 20 mensajes al modelo. Más
      // allá de ese tope la conversación crece linealmente en costo/latencia sin
      // agregar señal útil (el modelo ya tiene los principios estables y la idea
      // anclada en el system prompt). Fetched desc para que `take` aplique al
      // final cronológico; revertimos abajo antes de armar el array de messages.
      prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { role: true, content: true },
      }),
    ]);

    if (!r) throw new Error("Restaurant not found");

    restaurant = r;
    recentRecipes = recent;
    messages = history
      .slice()
      .reverse()
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  }

  } catch (error) {
    if (turn) await releaseChatTurn(turn).catch(() => undefined);
    throw error;
  }

  let system;
  try {
    const memory = ctx.restaurantId ? await chatMemory(ctx.restaurantId).catch(() => "") : null;
    system = buildSystemBlocks(restaurant, recentRecipes, pinnedIdeaText, memory);
  }
  catch (error) {
    if (turn) await releaseChatTurn(turn).catch(() => undefined);
    throw error;
  }
  const start = Date.now();

  // SSE stream — wire client AbortSignal so closing the connection cancels the
  // provider upstream call (avoids burning tokens after the client disconnects).
  const downstream = new AbortController();
  const signal = AbortSignal.any([req.signal, downstream.signal]);
  const stream = new ReadableStream({
    cancel() { downstream.abort(); },
    async start(controller) {
      const encoder = new TextEncoder();
      let assistantText = "";
      let inputTokens: number | undefined;
      let outputTokens: number | undefined;
      let cachedTokens: number | undefined;
      let aborted = false;
      let errored = false;

      // Keep the connection alive during reasoning and the final database write.
      const heartbeatInterval = setInterval(() => {
        if (aborted || errored) return;
        try {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "heartbeat", ts: Date.now() })}\n\n`,
            ),
          );
        } catch {
          // El cliente ya cerró; el finally limpia el interval.
        }
      }, 8_000);

      try {
        for await (const event of streamChat({ model, system, messages, signal, userId: ctx.userId })) {
          if (event.type === "usage") {
            inputTokens = event.usage.inputTokens;
            outputTokens = event.usage.outputTokens;
            cachedTokens = event.usage.cachedTokens;
          } else {
            assistantText += event.text;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "delta", text: event.text })}\n\n`));
          }
        }

        if (!assistantText.trim()) throw new Error("chat_response_incomplete");
        if (turn) await finishChatTurn(turn, assistantText, config.model, { inputTokens, outputTokens, cachedTokens, latencyMs: Date.now() - start });

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
        if (signal.aborted) {
          aborted = true;
        } else {
          errored = true;
          const rawMessage = err instanceof Error ? err.message : "stream error";
          // Provider errors arrive as deeply-nested JSON strings. Try to peel
          // one or two layers so the toast on mobile shows something readable
          // instead of "{\"error\":{\"message\":\"{\\n  \\\"error\\\":...".
          const message = extractFriendlyError(rawMessage);
          console.error(
            JSON.stringify({
              evt: "ai_stream_error",
              provider: config.provider,
              model,
              message,
              raw: rawMessage,
            }),
          );
          // Best-effort: client may already be gone if this was an abort path.
          try {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "error", message })}\n\n`),
            );
          } catch {}
        }
      } finally {
        // Always stop heartbeats when the stream completes or fails.
        clearInterval(heartbeatInterval);

        if (turn) await releaseChatTurn(turn).catch(() => undefined);
        // Log per-message telemetry to server stdout (brief sec. 10).
        console.log(
          JSON.stringify({
            evt: "ai_message",
            provider: config.provider,
            modelId: config.model,
            model,
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            cached_tokens: cachedTokens,
            latency_ms: Date.now() - start,
            aborted,
            partial_chars: aborted || errored ? assistantText.length : undefined,
          }),
        );
        // Telemetría diaria; la cuota del chat es semanal y la protege streamChat.
        if (inputTokens || outputTokens) {
          await recordAiTokens(ctx.userId, inputTokens ?? 0, outputTokens ?? 0).catch(() => undefined);
        }
        try {
          controller.close();
        } catch {}
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

// Walk through nested error envelopes (provider SDKs often serialise an HTTP
// error body as a JSON string inside `error.message` of another JSON body) to
// surface a single human-readable line for the client toast.
function extractFriendlyError(raw: string): string {
  let current: unknown = raw;
  for (let i = 0; i < 4; i++) {
    if (typeof current !== "string") break;
    const trimmed = current.trim();
    if (!trimmed.startsWith("{")) break;
    try {
      current = JSON.parse(trimmed);
    } catch {
      break;
    }
    if (typeof current === "object" && current !== null) {
      const c = current as Record<string, unknown>;
      const inner = (c.error as Record<string, unknown> | undefined)?.message ?? c.message;
      if (typeof inner === "string") current = inner;
    }
  }
  if (typeof current === "string") return current.trim().split("\n")[0] || "stream error";
  return "stream error";
}
