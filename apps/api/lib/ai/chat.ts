import Anthropic, {
  APIConnectionError, APIConnectionTimeoutError, APIError, AuthenticationError, BadRequestError,
  NotFoundError, PermissionDeniedError, RateLimitError,
} from "@anthropic-ai/sdk";
import { buildMessageBlocks, type Msg, type buildSystemBlocks } from "../anthropic";
import { chatConfig, providerKey } from "./config";
import { emptyUsage, tokenCount, type AiUsage } from "./types";
import type { ApiErrorCode, ChatModelSelection } from "@atelier/shared";
import { releaseGeneration, settleGeneration, settleInterruptedGeneration, type Reservation } from "./budget";
import { logger } from "../logger";

export type ChatEvent = { type: "delta"; text: string } | { type: "usage"; usage: AiUsage };
type ChatInput = {
  model?: ChatModelSelection; system: ReturnType<typeof buildSystemBlocks>; messages: Msg[];
  signal: AbortSignal; reservation: Reservation; userId?: string;
  deadlineAt?: number; inputCeiling?: number;
};

export type ChatErrorCode = Extract<ApiErrorCode,
  "ai_provider_failed" | "ai_rate_limited" | "ai_timeout" | "ai_response_blocked" | "chat_refused" | "chat_response_incomplete" | "chat_context_too_long">;

/** Closed chat failure. The message is the code; provider detail travels only in `cause`, for server logs. */
export class ChatError extends Error {
  readonly retryAfter?: number;
  constructor(readonly code: ChatErrorCode, options: { retryAfter?: number; cause?: unknown } = {}) {
    super(code, { cause: options.cause });
    this.name = "ChatError";
    if (options.retryAfter !== undefined) this.retryAfter = options.retryAfter;
  }
}

const GEMINI_BLOCKED = new Set(["SAFETY", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "RECITATION"]);
const ANTHROPIC_MISCONFIGURED = new Set(["invalid_request_error", "authentication_error", "permission_error", "not_found_error"]);

/** Retry-After as whole seconds (delta-seconds or HTTP date), when present and positive. */
function retryAfterSeconds(headers: Headers | null | undefined): number | undefined {
  const value = headers?.get("retry-after")?.trim();
  if (!value) return undefined;
  const seconds = /^\d+(\.\d+)?$/.test(value) ? Number(value) : (Date.parse(value) - Date.now()) / 1000;
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : undefined;
}

function anthropicChatError(err: APIError, modelId: string): ChatError {
  if (err instanceof APIConnectionTimeoutError) return new ChatError("ai_timeout", { cause: err });
  if (err instanceof APIConnectionError) return new ChatError("ai_provider_failed", { cause: err });
  if (err instanceof RateLimitError || err.type === "rate_limit_error") {
    return new ChatError("ai_rate_limited", { retryAfter: retryAfterSeconds(err.headers), cause: err });
  }
  if (err instanceof BadRequestError || err instanceof AuthenticationError || err instanceof PermissionDeniedError
    || err instanceof NotFoundError || (err.type !== null && ANTHROPIC_MISCONFIGURED.has(err.type))) {
    // Our request or credentials are wrong: it needs a fix, not a retry.
    logger.error("ai_provider_misconfigured", { provider: "anthropic", modelId, status: err.status ?? null, type: err.type, requestId: err.requestID ?? null, error: err });
  }
  // Overloaded (529), InternalServerError and mid-stream API errors.
  return new ChatError("ai_provider_failed", { cause: err });
}

/** Bound history by size as well as count, retaining whole recent exchanges. */
export function boundedChatHistory(messages: Msg[], maxChars = 40_000, maxMessages = 20): Msg[] {
  const selected: Msg[] = [];
  let chars = 0;
  for (const message of messages.slice(-maxMessages).reverse()) {
    if (chars + message.content.length > maxChars) break;
    selected.unshift(message);
    chars += message.content.length;
  }
  while (selected[0]?.role === "assistant") selected.shift();
  if (!selected.length) throw new ChatError("chat_context_too_long");
  return selected;
}

/**
 * Ventana del historial recortada por bloques para que la caché del prompt
 * siga acertando. Con una ventana deslizante el mensaje más viejo cambia en
 * cada turno y el prefijo cacheado nunca coincide; aquí el primer mensaje solo
 * se mueve en saltos de `step` (su índice absoluto es múltiplo de `step`) y se
 * mantiene igual varios turnos seguidos.
 *
 * `messages` son los últimos mensajes en orden cronológico y `total` cuántos
 * tiene la conversación entera, de modo que `messages[i]` es el mensaje
 * absoluto `total - messages.length + i`. Toma el bloque más largo que cumpla
 * `maxMessages` y `maxChars`; si ni el último bloque cabe, se queda con los
 * mensajes más recientes que quepan.
 */
export function stableHistoryWindow(
  messages: Msg[],
  total: number,
  { maxMessages = 20, maxChars = 40_000, step = 10 } = {},
): Msg[] {
  const all = Math.max(total, messages.length);
  const offset = all - messages.length;
  let window = messages;
  for (let start = Math.ceil(Math.max(0, all - maxMessages) / step) * step; start < all; start += step) {
    const block = messages.slice(Math.max(0, start - offset));
    if (block.reduce((chars, message) => chars + message.content.length, 0) <= maxChars) {
      window = block;
      break;
    }
  }
  // Red de seguridad y alternativa: recorta por tamaño, descarta los mensajes
  // iniciales del asistente y falla si no queda nada. Con un bloque que ya
  // cabe solo quita el asistente inicial.
  return boundedChatHistory(window, maxChars, maxMessages);
}

/** SSE records can span UTF-8 chunks, multiple lines, and CRLF boundaries. */
export async function* sseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let data: string[] = [];
  const processLine = (line: string): string | undefined => {
    if (!line) {
      const event = data.length ? data.join("\n") : undefined;
      data = [];
      return event;
    }
    if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
    return undefined;
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      pending += done ? decoder.decode() : decoder.decode(value, { stream: true });
      if (pending.length > 1_000_000) throw new Error("ai_stream_invalid");
      let newline: number;
      while ((newline = pending.indexOf("\n")) >= 0) {
        const event = processLine(pending.slice(0, newline).replace(/\r$/, ""));
        pending = pending.slice(newline + 1);
        if (event !== undefined) yield event;
      }
      if (done) break;
    }
    if (pending) processLine(pending.replace(/\r$/, ""));
    const last = processLine("");
    if (last !== undefined) yield last;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

/**
 * A4 — what the provider is known to bill, to close the reservation honestly:
 * `final` exact usage; `input` exact input/cache of a started stream (output
 * unknown); `nothingBilled` when the provider definitively generated nothing.
 */
type Billing = { final?: AiUsage; input?: AiUsage; nothingBilled?: boolean; inputCeiling?: number };

async function closeReservation(reservation: Reservation, billing: Billing): Promise<void> {
  if (billing.final) await settleGeneration(reservation, billing.final);
  else if (billing.nothingBilled) await releaseGeneration(reservation);
  else if (billing.input) await settleInterruptedGeneration(reservation, billing.input);
  else if (billing.inputCeiling !== undefined) {
    // A managed HTTP turn must close even when dispatch produced no usage.
    // Pass the prepared input ceiling; settleInterruptedGeneration replaces
    // outputTokens with the locked generation row's full output ceiling.
    await settleInterruptedGeneration(reservation, { ...emptyUsage(), inputTokens: billing.inputCeiling });
  }
  // Unmanaged diagnostic callers retain A4's hold-for-reconciliation behavior.
}

/**
 * Only an HTTP error status before the stream began proves nothing was generated.
 * A connection failure without a response is uncertain (the request may have
 * reached the provider), so it keeps the hold: never under-count.
 */
function anthropicGeneratedNothing(err: unknown): boolean {
  return err instanceof APIError && err.status !== undefined;
}

export async function* streamChat(input: ChatInput): AsyncGenerator<ChatEvent> {
  // prepare owns the hold until run; all pre-provider checks must also refund it.
  const billing: Billing = { nothingBilled: true, inputCeiling: input.inputCeiling };
  try {
    const config = chatConfig(input.model);
    providerKey(config.provider);
    input.signal.throwIfAborted();
    if (input.deadlineAt !== undefined && Date.now() >= input.deadlineAt) throw new ChatError("ai_timeout");
    const messages = boundedChatHistory(input.messages);
    yield* streamChatProvider({ ...input, messages }, billing);
  } finally { await closeReservation(input.reservation, billing); }
}

async function* streamChatProvider(input: ChatInput, billing: Billing): AsyncGenerator<ChatEvent> {
  const config = chatConfig(input.model);
  // Managed turns already carry their request-start deadline in input.signal.
  // Keep the legacy adapter deadline only for callers without that lifecycle.
  const deadline = input.deadlineAt === undefined ? AbortSignal.timeout(config.timeoutMs) : undefined;
  try {
    yield* streamChatUpstream(input, deadline ? AbortSignal.any([input.signal, deadline]) : input.signal, billing);
  } catch (err) {
    if (input.signal.aborted) throw err;
    if (deadline?.aborted) throw new ChatError("ai_timeout", { cause: err });
    if (err instanceof ChatError) throw err;
    if (err instanceof APIError) throw anthropicChatError(err, config.model);
    throw new ChatError("ai_provider_failed", { cause: err });
  }
}

async function* streamChatUpstream(input: ChatInput, signal: AbortSignal, billing: Billing): AsyncGenerator<ChatEvent> {
  const config = chatConfig(input.model);
  const key = providerKey(config.provider);
  const messages = boundedChatHistory(input.messages);
  let text = "";
  if (config.provider === "anthropic") {
    const timeout = input.deadlineAt === undefined ? config.timeoutMs : Math.max(1, input.deadlineAt - Date.now());
    const client = new Anthropic({ apiKey: key, maxRetries: 0, timeout });
    const messageBlocks = buildMessageBlocks(messages);
    signal.throwIfAborted();
    billing.nothingBilled = false; // From dispatch onward, preserve A4's uncertainty rules.
    const upstream = client.messages.stream({
      model: config.model, max_tokens: config.maxTokens,
      system: input.system, messages: messageBlocks,
      thinking: { type: "adaptive", display: "omitted" },
      // Opus 5.5 razona más que Opus 5 en el mismo nivel: en medio iguala a
      // Opus 5 en alto con menos tokens, así que responde antes y cuesta menos.
      output_config: { effort: "medium" },
    }, { signal });
    let usage = emptyUsage();
    try {
      for await (const event of upstream) {
        if (event.type === "message_start") {
          const u = event.message.usage;
          usage = { ...usage, inputTokens: tokenCount(u.input_tokens) + tokenCount(u.cache_creation_input_tokens) + tokenCount(u.cache_read_input_tokens),
            outputTokens: tokenCount(u.output_tokens), cachedTokens: tokenCount(u.cache_read_input_tokens), cacheWriteTokens: tokenCount(u.cache_creation_input_tokens) };
          billing.input = usage; // Input is billed exactly from here on.
          yield { type: "usage", usage };
        } else if (event.type === "message_delta") {
          usage = { ...usage, outputTokens: tokenCount(event.usage.output_tokens) };
          yield { type: "usage", usage };
        } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          text += event.delta.text;
          yield { type: "delta", text: event.delta.text };
        }
      }
    } catch (err) {
      if (!billing.input && !signal.aborted && anthropicGeneratedNothing(err)) billing.nothingBilled = true;
      throw err;
    }
    const final = await upstream.finalMessage();
    const u = final.usage;
    const finalUsage = { ...usage,
      inputTokens: tokenCount(u.input_tokens) + tokenCount(u.cache_creation_input_tokens) + tokenCount(u.cache_read_input_tokens),
      outputTokens: tokenCount(u.output_tokens), cachedTokens: tokenCount(u.cache_read_input_tokens), cacheWriteTokens: tokenCount(u.cache_creation_input_tokens),
    };
    if (Number.isSafeInteger(u.input_tokens) && Number.isSafeInteger(u.output_tokens) && finalUsage.inputTokens > 0) billing.final = finalUsage;
    yield { type: "usage", usage: finalUsage };
    // Los filtros de seguridad del proveedor pueden negarse (en Opus 5.5 hay
    // uno de biología): se registra la categoría y el chef recibe un aviso.
    if (final.stop_reason === "refusal") {
      console.warn(JSON.stringify({ evt: "ai_refusal", provider: config.provider, modelId: config.model, category: final.stop_details?.category ?? null }));
      throw new ChatError("chat_refused");
    }
    if (final.stop_reason !== "end_turn" || !text.trim()) throw new ChatError("chat_response_incomplete");
    return;
  }

  const body = JSON.stringify({
    systemInstruction: { parts: input.system.map(block => ({ text: block.text })) },
    contents: messages.map(message => ({ role: message.role === "assistant" ? "model" : "user", parts: [{ text: message.content }] })),
    generationConfig: { maxOutputTokens: config.maxTokens, thinkingConfig: { thinkingLevel: "low", includeThoughts: false } },
  });
  // A fetch that throws (no response, or an abort) is uncertain: the hold stays.
  signal.throwIfAborted();
  billing.nothingBilled = false;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:streamGenerateContent?alt=sse`, {
    method: "POST", signal,
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body,
  });
  if (!response.ok) {
    billing.nothingBilled = true; // An HTTP error status before any stream event.
    if (response.status === 429) throw new ChatError("ai_rate_limited", { retryAfter: retryAfterSeconds(response.headers) });
    if (response.status === 408 || response.status === 504) throw new ChatError("ai_timeout");
    const detail = (await response.text().catch(() => "")).slice(0, 500);
    logger.error("ai_provider_http_error", { provider: config.provider, modelId: config.model, status: response.status, body: detail });
    throw new ChatError("ai_provider_failed");
  }
  if (!response.body) throw new ChatError("chat_response_incomplete");
  let finishReason: string | undefined;
  let usage = emptyUsage();
  let completeUsage = false;
  for await (const data of sseData(response.body)) {
    if (data === "[DONE]") break;
    const chunk = JSON.parse(data);
    if (chunk.usageMetadata) {
      const u = chunk.usageMetadata;
      completeUsage = Number.isSafeInteger(u.promptTokenCount) && u.promptTokenCount > 0 && Number.isSafeInteger(u.candidatesTokenCount);
      usage = { inputTokens: tokenCount(u.promptTokenCount),
        outputTokens: tokenCount(u.candidatesTokenCount) + tokenCount(u.thoughtsTokenCount),
        reasoningTokens: tokenCount(u.thoughtsTokenCount), cachedTokens: tokenCount(u.cachedContentTokenCount) };
      if (Number.isSafeInteger(u.promptTokenCount) && u.promptTokenCount > 0) billing.input = usage;
      yield { type: "usage", usage };
    }
    if (chunk.error) throw new ChatError("ai_provider_failed", { cause: new Error(JSON.stringify(chunk.error).slice(0, 500)) });
    if (chunk.promptFeedback?.blockReason) throw new ChatError("ai_response_blocked");
    const candidate = chunk.candidates?.[0];
    if (candidate?.finishReason) finishReason = candidate.finishReason;
    for (const part of candidate?.content?.parts ?? []) {
      if (typeof part.text === "string" && !part.thought) {
        text += part.text;
        yield { type: "delta", text: part.text };
      }
    }
  }
  if (finishReason && completeUsage) billing.final = usage;
  if (finishReason && GEMINI_BLOCKED.has(finishReason)) throw new ChatError("ai_response_blocked");
  if (finishReason !== "STOP" || !text.trim()) throw new ChatError("chat_response_incomplete");
}
