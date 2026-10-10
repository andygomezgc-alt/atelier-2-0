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
import { CHAT_HEARTBEAT_MS, claimChatTurn, saveChatTurn, finishChatTurn, releaseChatTurn, ownsChatTurn, type ChatTurn, type ClaimedChatTurn } from "@/lib/chat-turn";

interface PrepareChatTurnInput {
  conversationId: string;
  user: AuthedContext;
  message: PostMessageRequest;
  signal: AbortSignal;
  generationSignal?: AbortSignal;
  startedAt?: number;
  deadlineAt?: number;
}

export interface PreparedChatTurn {
  conversationId: string;
  restaurantId: string | null;
  model: ChatModelSelection;
  config: ReturnType<typeof chatConfig>;
  system: ReturnType<typeof buildSystemBlocks>;
  messages: Msg[];
  reservation: Reservation;
  turn?: ChatTurn;
  userId: string;
  startedAt: number;
  deadlineAt?: number;
}

interface TurnUsage {
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
}

interface TurnDoneEvent extends TurnUsage { type: "done" }
interface TurnErrorEvent { type: "error"; code: StreamErrorCode; message: string; retryAfter?: number }
export type ChatTurnEvent = { type: "delta"; text: string } | TurnDoneEvent | TurnErrorEvent | { type: "stopped" };

/** A refusal/replay is an HTTP response; a prepared turn owns a hold and optional lease. */
export async function prepareChatTurn(input: PrepareChatTurnInput): Promise<PreparedChatTurn | Response> {
  const { conversationId, user, message, signal } = input;
  const startedAt = input.startedAt ?? Date.now();
  const checkDeadline = () => {
    input.generationSignal?.throwIfAborted();
    if (input.deadlineAt !== undefined && Date.now() >= input.deadlineAt) throw new ChatError("ai_timeout");
  };
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
    checkDeadline();
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
    let speakerName: string | null;
    // The speaker's profile name is optional context: a failed read never blocks the turn.
    const loadSpeakerName = () => prisma.user.findUnique({ where: { id: user.userId }, select: { name: true } })
      .then(speaker => speaker?.name ?? null, () => null);

    if (isPreview) {
      restaurant = { name: "Tu cocina", identityLine: null };
      speakerName = await loadSpeakerName();
      const rawHistory = message.history ?? [];
      const history: Msg[] = rawHistory.slice(-20);
      let total = rawHistory.length;
      const last = history.at(-1);
      if (!last || last.role !== "user" || last.content !== message.content) {
        history.push({ role: "user", content: message.content });
        total++;
      }
      // Count after appending, so each client window shares the saved-chat alignment.
      messages = stableHistoryWindow(history, total);
    } else {
      const [r, history, total, recent, notes, preparedMemory, speaker] = await Promise.all([
        prisma.restaurant.findUnique({
          where: { id: user.restaurantId },
          select: { name: true, identityLine: true, city: true },
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
        loadSpeakerName(),
      ]);
      if (!r) throw new Error("Restaurant not found");
      restaurant = { ...r, chefNotes: notes.map(note => note.text) };
      speakerName = speaker;
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

    const system = buildSystemBlocks(restaurant, recentRecipes, pinnedIdeaText, culinaryMemory, { speakerName });
    signal.throwIfAborted();
    checkDeadline();
    // Estimate the exact prepared payload, but never persist a refused turn.
    reservation = await reserveGeneration(config, textInputCeiling({ system, messages }), user.userId);
    // A reserved turn belongs to the server, not to the HTTP connection.
    checkDeadline();
    // The claimed lease remains available to catch even if persistence fails.
    const turn = lease ? await saveChatTurn(lease, message.content, message.clientMessageId) : undefined;
    checkDeadline();
    return { conversationId, restaurantId: user.restaurantId || null,
      model, config, system, messages, reservation, turn, userId: user.userId, startedAt, deadlineAt: input.deadlineAt };
  } catch (error) {
    // Independent cleanup: a failed refund must not strand the conversation lease.
    if (reservation) await releaseGeneration(reservation).catch(() => undefined);
    if (lease) await releaseChatTurn(lease).catch(() => undefined);
    const refusal = budgetErrorResponse(error);
    if (refusal) return refusal;
    if (error instanceof ChatError && error.code === "ai_timeout") {
      return Response.json({ error: error.code, code: error.code }, { status: 503 });
    }
    // Only the abort itself is a clean disconnect. A coincident real failure
    // must reach the route's error logger and HTTP 503, even after the client left.
    if ((error instanceof Error && error.name === "AbortError") || (signal.aborted && error === signal.reason)) {
      return Response.json({ error: "chat_response_incomplete", code: "chat_response_incomplete" }, { status: 499 });
    }
    throw error;
  }
}

/** The adapter owns A4 billing from dispatch; this service owns persistence and the lease. */
export async function* runChatTurn(prepared: PreparedChatTurn, signal: AbortSignal): AsyncGenerator<ChatTurnEvent> {
  const { conversationId, restaurantId, model, config, system, messages, reservation, turn, userId, startedAt, deadlineAt } = prepared;
  let assistantText = "";
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  let cachedTokens: number | undefined;
  let cacheWriteTokens: number | undefined;
  let timeToFirstTokenMs: number | null = null;
  // An iterator closed before a terminal event is an aborted turn, not success.
  let outcome: TurnOutcome = TURN_OUTCOME.aborted;
  let stopped = false;
  let adapterStarted = false;
  let ownershipCheck: Promise<void> | undefined;
  const stopController = new AbortController();
  const providerSignal = AbortSignal.any([signal, stopController.signal]);
  const checkOwnership = (): Promise<void> => {
    if (!turn || stopped) return Promise.resolve();
    if (ownershipCheck) return ownershipCheck;
    ownershipCheck = ownsChatTurn(turn).then(owns => {
      if (!owns) {
        stopped = true;
        stopController.abort(new DOMException("Chat stopped", "AbortError"));
      }
    }).catch(error => {
      // A failed read is not proof of lost ownership. Retry on the next heartbeat;
      // the request deadline bounds generation and finishChatTurn still fences saves.
      logger.warn("ai_turn_ownership_check_failed", {
        conversationId: turn.conversationId, generationId: turn.generationId, error,
      });
    }).finally(() => { ownershipCheck = undefined; });
    return ownershipCheck;
  };
  // This monitor survives SSE cancellation and also checks an idle provider.
  const heartbeat = turn ? setInterval(() => { void checkOwnership(); }, CHAT_HEARTBEAT_MS) : undefined;
  try {
    await checkOwnership();
    if (stopped) { outcome = TURN_OUTCOME.stopped; yield { type: "stopped" }; return; }
    providerSignal.throwIfAborted();
    if (deadlineAt !== undefined && Date.now() >= deadlineAt) throw new ChatError("ai_timeout");
    adapterStarted = true;
    for await (const event of streamChat({
      model, system, messages, signal: providerSignal, reservation, userId, deadlineAt,
      inputCeiling: textInputCeiling({ system, messages }),
    })) {
      if (event.type === "usage") {
        inputTokens = event.usage.inputTokens;
        outputTokens = event.usage.outputTokens;
        cachedTokens = event.usage.cachedTokens;
        cacheWriteTokens = event.usage.cacheWriteTokens;
      } else {
        if (timeToFirstTokenMs === null && event.text.length > 0) timeToFirstTokenMs = Date.now() - startedAt;
        assistantText += event.text;
        yield event;
      }
    }
    // No heartbeat may mistake finish's successful lease release for Stop.
    clearInterval(heartbeat);
    await checkOwnership();
    if (stopped) { outcome = TURN_OUTCOME.stopped; yield { type: "stopped" }; return; }
    if (!assistantText.trim()) throw new ChatError("chat_response_incomplete");
    if (turn) await finishChatTurn(turn, assistantText, config.model, {
      generationId: reservation.id, inputTokens, outputTokens, cachedTokens, cacheWriteTokens, latencyMs: Date.now() - startedAt,
    });
    outcome = TURN_OUTCOME.done;
    yield { type: "done", inputTokens, outputTokens, cachedTokens };
  } catch (err) {
    if (stopped || (err instanceof Error && err.message === "chat_generation_expired")) {
      outcome = TURN_OUTCOME.stopped;
      yield { type: "stopped" };
    } else {
      const failure = signal.aborted ? signal.reason : err;
      const { code, retryAfter } = streamErrorCode(failure);
      outcome = failure instanceof Error && failure.name === "AbortError" ? TURN_OUTCOME.aborted : code;
      const cause = failure instanceof Error && failure.cause !== undefined ? failure.cause : failure;
      (code === "ai_provider_failed" || code === "ai_timeout" ? logger.error : logger.warn)("ai_stream_error", {
        provider: config.provider, modelId: config.model, model, code, retryAfter,
        detail: cause instanceof Error ? `${cause.name}: ${cause.message}`.slice(0, 500) : undefined,
        ...(code === "ai_provider_failed" || code === "ai_timeout" ? { error: failure } : {}),
      });
      // Installed apps use this localized fallback; never expose provider text.
      const message = t(STREAM_ERROR_KEYS[code], await userLanguage(userId));
      yield { type: "error", code, message, retryAfter };
    }
  } finally {
    clearInterval(heartbeat);
    await ownershipCheck;
    // Before adapter dispatch the service still owns the prepared hold.
    if (!adapterStarted) await releaseGeneration(reservation).catch(() => undefined);
    if (turn) await releaseChatTurn(turn).catch(() => undefined);
    // A2's ai_stream_error retains error detail/Sentry; this summary is metadata only.
    (outcome === TURN_OUTCOME.done ? logger.info : logger.warn)("ai_turn", {
      conversationId, restaurantId, userId, provider: config.provider, modelId: config.model, model,
      outcome, generationId: reservation.id,
      inputTokens: inputTokens ?? null, outputTokens: outputTokens ?? null, cachedTokens: cachedTokens ?? null,
      cacheWriteTokens: cacheWriteTokens ?? null, timeToFirstTokenMs, latencyMs: Date.now() - startedAt,
      partial_chars: outcome === TURN_OUTCOME.done ? 0 : assistantText.length,
    });
    if (inputTokens || outputTokens) {
      await recordAiTokens(userId, inputTokens ?? 0, outputTokens ?? 0).catch(() => undefined);
    }
  }
}

const TURN_OUTCOME = { done: "done", stopped: "stopped", aborted: "aborted" } as const;
type TurnOutcome = (typeof TURN_OUTCOME)[keyof typeof TURN_OUTCOME] | StreamErrorCode;

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
