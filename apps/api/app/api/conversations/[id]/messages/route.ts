import { NextRequest } from "next/server";
import { chatMemory } from "@/lib/culinary-memory/service";
import { prisma } from "@atelier/db";
import { PostMessageRequestSchema, can, type ApiErrorCode } from "@atelier/shared";
import { t, type Language, type TranslationKey } from "@atelier/i18n";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { buildSystemBlocks, type Msg } from "@/lib/anthropic";
import { recordAiTokens } from "@/lib/ai-quota";

import { ChatError, stableHistoryWindow, streamChat } from "@/lib/ai/chat";
import { chatConfig, providerConfigured } from "@/lib/ai/config";
import { logger } from "@/lib/logger";

import { beginChatTurn, finishChatTurn, releaseChatTurn, type ChatTurn } from "@/lib/chat-turn";

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
  let config: ReturnType<typeof chatConfig>;
  try {
    config = chatConfig(model);
  } catch (error) {
    logger.error("ai_model_configuration_invalid", { model, error });
    return unconfiguredResponse();
  }
  // El Creativo (modelo caro) es del admin y del chef ejecutivo; el sous-chef
  // usa el Diario. Se decide en el servidor: el cliente no manda el rol.
  if (config.task === "creative" && !can(ctx.role, "use_creative_chat")) {
    return Response.json({ error: "El chat Creativo está reservado al administrador y al chef ejecutivo.", code: "forbidden" }, { status: 403 });
  }
  if (!providerConfigured(config.provider)) {
    logger.error("ai_provider_unconfigured", { provider: config.provider, model });
    return unconfiguredResponse();
  }

  let restaurant: { name: string; identityLine: string | null; chefNotes?: string[] } | null = null;
  let recentRecipes: { title: string }[] = [];
  let culinaryMemory: string | null = null;
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
    const [r, history, total, recent, notes, preparedMemory] = await Promise.all([
      prisma.restaurant.findUnique({
        where: { id: ctx.restaurantId },
        select: { name: true, identityLine: true },
      }),
      // Ventana por bloques: solo re-enviamos los últimos 20 mensajes al modelo.
      // Más allá de ese tope la conversación crece linealmente en costo/latencia
      // sin agregar señal útil (el modelo ya tiene los principios estables y la
      // idea anclada en el system prompt). Pero una ventana que se desliza un
      // mensaje por turno cambia el comienzo del hilo cada vez y la caché del
      // prompt nunca acierta: `stableHistoryWindow` corta en múltiplos de 10 del
      // índice absoluto (por eso el conteo total), así el primer mensaje se
      // mantiene varios turnos y el prefijo cacheado sigue coincidiendo. Fetched
      // desc para que `take` aplique al final cronológico; revertimos abajo.
      prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { role: true, content: true },
      }),
      prisma.message.count({ where: { conversationId } }),
      prisma.recipe.findMany({
        where: { restaurantId: ctx.restaurantId, deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: { title: true },
      }),
      prisma.chefNote.findMany({
        where: { restaurantId: ctx.restaurantId },
        orderBy: { createdAt: "asc" },
        take: 10,
        select: { text: true },
      }),
      chatMemory(ctx.restaurantId).catch(() => null),
    ]);

    if (!r) throw new Error("Restaurant not found");

    restaurant = { ...r, chefNotes: notes.map((note) => note.text) };
    recentRecipes = recent;
    culinaryMemory = preparedMemory || null;
    messages = stableHistoryWindow(
      history
        .slice()
        .reverse()
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      total,
    );
  }

  } catch (error) {
    if (turn) await releaseChatTurn(turn).catch(() => undefined);
    throw error;
  }

  let system;
  try {
    system = buildSystemBlocks(restaurant, recentRecipes, pinnedIdeaText, culinaryMemory);
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

        if (!assistantText.trim()) throw new ChatError("chat_response_incomplete");
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
          const { code, retryAfter } = streamErrorCode(err);
          // Provider/config failures reach Sentry; refusals and limits are expected.
          const cause = err instanceof Error && err.cause !== undefined ? err.cause : err;
          (code === "ai_provider_failed" || code === "ai_timeout" ? logger.error : logger.warn)("ai_stream_error", {
            provider: config.provider, modelId: config.model, model, code, retryAfter,
            detail: cause instanceof Error ? `${cause.name}: ${cause.message}`.slice(0, 500) : undefined,
            ...(code === "ai_provider_failed" || code === "ai_timeout" ? { error: err } : {}),
          });
          // `message` is the fallback for installed apps that only read text:
          // localized from the closed code, never the provider's own text.
          const message = t(STREAM_ERROR_KEYS[code], await userLanguage(ctx.userId));
          // Best-effort: client may already be gone if this was an abort path.
          try {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "error", code, message, retryAfter })}\n\n`),
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

function unconfiguredResponse() {
  return Response.json({
    error: "El asistente todavía no está configurado. Inténtalo más tarde.", code: "ai_provider_unconfigured",
  }, { status: 503 });
}

// A2 — closed set of codes the chat stream can emit, with the i18n key of
// their fallback text.
const STREAM_ERROR_KEYS = {
  ai_provider_failed: "error_ai_provider_failed",
  ai_rate_limited: "error_ai_rate_limited",
  ai_timeout: "error_ai_timeout",
  ai_response_blocked: "error_ai_response_blocked",
  chat_refused: "error_chat_refused",
  chat_response_incomplete: "error_chat_response_incomplete",
  chat_context_too_long: "error_chat_context_too_long",
  ai_budget_exhausted: "ai_budget_exhausted",
  ai_budget_expired: "ai_budget_expired",
  ai_budget_unavailable: "ai_budget_unavailable",
  ai_daily_weekly_limit: "ai_daily_weekly_limit",
  ai_creative_limit: "ai_creative_limit",
} as const satisfies Partial<Record<ApiErrorCode, TranslationKey>>;
type StreamErrorCode = keyof typeof STREAM_ERROR_KEYS;

const isStreamErrorCode = (value: unknown): value is StreamErrorCode =>
  typeof value === "string" && Object.hasOwn(STREAM_ERROR_KEYS, value);

// ChatError and AiBudgetError carry `code`/`retryAfter`; older throw sites
// still use the code as the message. A newer generation took over the turn
// (`chat_generation_expired`): the answer was not saved, so it is incomplete.
// Anything else is a provider failure.
function streamErrorCode(err: unknown): { code: StreamErrorCode; retryAfter?: number } {
  const { code, retryAfter, message } = (err ?? {}) as { code?: unknown; retryAfter?: unknown; message?: unknown };
  const closed = isStreamErrorCode(code) ? code
    : isStreamErrorCode(message) ? message
    : message === "chat_generation_expired" ? "chat_response_incomplete"
    : "ai_provider_failed";
  const seconds = typeof retryAfter === "number" && Number.isFinite(retryAfter) && retryAfter > 0 ? Math.ceil(retryAfter) : undefined;
  return { code: closed, retryAfter: seconds };
}

async function userLanguage(userId: string): Promise<Language> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { languagePref: true } }).catch(() => null);
  const language = user?.languagePref;
  return language === "en" || language === "it" ? language : "es";
}
