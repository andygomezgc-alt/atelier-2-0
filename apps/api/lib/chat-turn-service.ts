import { prisma } from "@atelier/db";
import { can, type ApiErrorCode, type ChatModelSelection, type PostMessageRequest } from "@atelier/shared";
import { t, type Language, type TranslationKey } from "@atelier/i18n";
import { buildSystemBlocks, type Msg } from "@/lib/anthropic";
import { ChatError, stableHistoryWindow, streamChat } from "@/lib/ai/chat";
import { chatConfig, providerConfigured } from "@/lib/ai/config";
import { releaseGeneration, reserveGeneration, type Reservation } from "@/lib/ai/budget";
import { budgetErrorResponse, textInputCeiling } from "@/lib/ai/budget-policy";
import { recordAiTokens } from "@/lib/ai-quota";
import { chatMemory } from "@/lib/culinary-memory/service";
import { logger } from "@/lib/logger";
import type { AuthedContext } from "@/lib/permissions-guard";
import { claimChatTurn, saveChatTurn, finishChatTurn, releaseChatTurn, type ChatTurn, type ClaimedChatTurn } from "@/lib/chat-turn";

interface PrepareChatTurnInput {
  conversationId: string;
  user: AuthedContext;
  message: PostMessageRequest;
  signal: AbortSignal;
}

export interface PreparedChatTurn {
  model: ChatModelSelection;
  config: ReturnType<typeof chatConfig>;
  system: ReturnType<typeof buildSystemBlocks>;
  messages: Msg[];
  reservation: Reservation;
  turn?: ChatTurn;
  userId: string;
  startedAt: number;
}

interface TurnUsage {
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
}

interface TurnDoneEvent extends TurnUsage { type: "done" }
interface TurnErrorEvent { type: "error"; code: StreamErrorCode; message: string; retryAfter?: number }
export type ChatTurnEvent = { type: "delta"; text: string } | TurnDoneEvent | TurnErrorEvent;

/** A refusal/replay is an HTTP response; a prepared turn owns a hold and optional lease. */
export async function prepareChatTurn(input: PrepareChatTurnInput): Promise<PreparedChatTurn | Response> {
  const { conversationId, user, message, signal } = input;
  const isPreview = conversationId === "preview";
  const model = message.model ?? "daily";
  let config: ReturnType<typeof chatConfig>;
  try {
    config = chatConfig(model);
  } catch (error) {
    logger.error("ai_model_configuration_invalid", { model, error });
    return unconfiguredResponse();
  }
  if (config.task === "creative" && (!user.restaurantId || !can(user.role, "use_creative_chat"))) {
    return Response.json({ error: "El chat Creativo está reservado al administrador y al chef ejecutivo.", code: "forbidden" }, { status: 403 });
  }
  if (!providerConfigured(config.provider)) {
    logger.error("ai_provider_unconfigured", { provider: config.provider, model });
    return unconfiguredResponse();
  }

  let lease: ClaimedChatTurn | undefined;
  let reservation: Reservation | undefined;
  try {
    signal.throwIfAborted();
    let pinnedIdeaText: string | null = null;
    if (!isPreview) {
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: { idea: { select: { text: true } } },
      });
      if (!conversation || conversation.restaurantId !== user.restaurantId) {
        return Response.json({ error: "Not found" }, { status: 404 });
      }
      pinnedIdeaText = conversation.idea?.text ?? null;
      const claimed = await claimChatTurn(conversationId, user.restaurantId, message.content, message.clientMessageId);
      // claim releases its own lease for replay/conflict responses.
      if (claimed instanceof Response) return claimed;
      lease = claimed;
    }

    let restaurant: Parameters<typeof buildSystemBlocks>[0];
    let recentRecipes: { title: string }[] = [];
    let culinaryMemory: string | null = null;
    let messages: Msg[];

    if (isPreview) {
      restaurant = { name: "Tu cocina", identityLine: null };
      const history: Msg[] = [...(message.history ?? [])];
      const last = history.at(-1);
      if (!last || last.role !== "user" || last.content !== message.content) {
        history.push({ role: "user", content: message.content });
      }
      // Count after appending, so each client window shares the saved-chat alignment.
      messages = stableHistoryWindow(history, history.length);
    } else {
      const [r, history, total, recent, notes, preparedMemory] = await Promise.all([
        prisma.restaurant.findUnique({
          where: { id: user.restaurantId },
          select: { name: true, identityLine: true },
        }),
        prisma.message.findMany({
          where: { conversationId }, orderBy: { createdAt: "desc" }, take: 20,
          select: { role: true, content: true },
        }),
        prisma.message.count({ where: { conversationId } }),
        prisma.recipe.findMany({
          where: { restaurantId: user.restaurantId, deletedAt: null },
          orderBy: { createdAt: "desc" }, take: 8, select: { title: true },
        }),
        prisma.chefNote.findMany({
          where: { restaurantId: user.restaurantId },
          orderBy: { createdAt: "asc" }, take: 10, select: { text: true },
        }),
        chatMemory(user.restaurantId).catch(() => null),
      ]);
      if (!r) throw new Error("Restaurant not found");
      restaurant = { ...r, chefNotes: notes.map(note => note.text) };
      recentRecipes = recent;
      culinaryMemory = preparedMemory || null;
      const historyWithCurrent: Msg[] = history.slice().reverse()
        .filter(m => m.role === "user" || m.role === "assistant")
        .map(m => ({ role: m.role as Msg["role"], content: m.content }));
      // An unanswered retry is already in history. A new turn must be appended,
      // even when its content repeats the previous user message.
      const isNewMessage = !lease?.userMessageId;
      if (isNewMessage) historyWithCurrent.push({ role: "user", content: message.content });
      messages = stableHistoryWindow(historyWithCurrent, total + (isNewMessage ? 1 : 0));
    }

    const system = buildSystemBlocks(restaurant, recentRecipes, pinnedIdeaText, culinaryMemory);
    signal.throwIfAborted();
    // Estimate the exact prepared payload, but never persist a refused turn.
    reservation = await reserveGeneration(config, textInputCeiling({ system, messages }), user.userId);
    signal.throwIfAborted();
    // The claimed lease remains available to catch even if persistence fails.
    const turn = lease ? await saveChatTurn(lease, message.content, message.clientMessageId) : undefined;
    signal.throwIfAborted();
    return { model, config, system, messages, reservation, turn, userId: user.userId, startedAt: Date.now() };
  } catch (error) {
    // Independent cleanup: a failed refund must not strand the conversation lease.
    if (reservation) await releaseGeneration(reservation).catch(() => undefined);
    if (lease) await releaseChatTurn(lease).catch(() => undefined);
    const refusal = budgetErrorResponse(error);
    if (refusal) return refusal;
    throw error;
  }
}

/** The adapter owns A4 billing from dispatch; this service owns persistence and the lease. */
export async function* runChatTurn(prepared: PreparedChatTurn, signal: AbortSignal): AsyncGenerator<ChatTurnEvent> {
  const { model, config, system, messages, reservation, turn, userId, startedAt } = prepared;
  let assistantText = "";
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  let cachedTokens: number | undefined;
  let aborted = false;
  let errored = false;
  try {
    for await (const event of streamChat({ model, system, messages, signal, reservation, userId })) {
      if (event.type === "usage") {
        inputTokens = event.usage.inputTokens;
        outputTokens = event.usage.outputTokens;
        cachedTokens = event.usage.cachedTokens;
      } else {
        assistantText += event.text;
        yield event;
      }
    }
    if (!assistantText.trim()) throw new ChatError("chat_response_incomplete");
    if (turn) await finishChatTurn(turn, assistantText, config.model, {
      inputTokens, outputTokens, cachedTokens, latencyMs: Date.now() - startedAt,
    });
    yield { type: "done", inputTokens, outputTokens, cachedTokens };
  } catch (err) {
    if (signal.aborted) {
      aborted = true;
    } else {
      errored = true;
      const { code, retryAfter } = streamErrorCode(err);
      const cause = err instanceof Error && err.cause !== undefined ? err.cause : err;
      (code === "ai_provider_failed" || code === "ai_timeout" ? logger.error : logger.warn)("ai_stream_error", {
        provider: config.provider, modelId: config.model, model, code, retryAfter,
        detail: cause instanceof Error ? `${cause.name}: ${cause.message}`.slice(0, 500) : undefined,
        ...(code === "ai_provider_failed" || code === "ai_timeout" ? { error: err } : {}),
      });
      // Installed apps use this localized fallback; never expose provider text.
      const message = t(STREAM_ERROR_KEYS[code], await userLanguage(userId));
      yield { type: "error", code, message, retryAfter };
    }
  } finally {
    aborted ||= signal.aborted;
    if (turn) await releaseChatTurn(turn).catch(() => undefined);
    console.log(JSON.stringify({
      evt: "ai_message", provider: config.provider, modelId: config.model, model,
      input_tokens: inputTokens, output_tokens: outputTokens, cached_tokens: cachedTokens,
      latency_ms: Date.now() - startedAt, aborted,
      partial_chars: aborted || errored ? assistantText.length : undefined,
    }));
    if (inputTokens || outputTokens) {
      await recordAiTokens(userId, inputTokens ?? 0, outputTokens ?? 0).catch(() => undefined);
    }
  }
}

function unconfiguredResponse() {
  return Response.json({
    error: "El asistente todavía no está configurado. Inténtalo más tarde.", code: "ai_provider_unconfigured",
  }, { status: 503 });
}

// A2 closed codes and localized fallbacks are unchanged by turn preparation.
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
