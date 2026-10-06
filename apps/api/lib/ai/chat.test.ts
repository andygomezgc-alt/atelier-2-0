import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./budget", () => ({ reserveGeneration: vi.fn().mockResolvedValue({ id: "reservation" }), settleGeneration: vi.fn().mockResolvedValue(undefined) }));
const { opusStream, constructor } = vi.hoisted(() => ({ opusStream: vi.fn(), constructor: vi.fn() }));
vi.mock("@anthropic-ai/sdk", async importOriginal => ({ ...(await importOriginal<typeof import("@anthropic-ai/sdk")>()), default: class {
  messages = { stream: opusStream };
  constructor(options: unknown) { constructor(options); }
} }));
import { APIConnectionError, APIConnectionTimeoutError, APIError, APIUserAbortError, AuthenticationError, BadRequestError, InternalServerError, NotFoundError, PermissionDeniedError, RateLimitError } from "@anthropic-ai/sdk";
import { inspect } from "node:util";
import { boundedChatHistory, sseData, stableHistoryWindow, streamChat, type ChatEvent } from "./chat";
import type { Msg } from "../anthropic";
import type { ChatModelSelection } from "@atelier/shared";
import { reserveGeneration, settleGeneration } from "./budget";
import { logger } from "../logger";

const input = (model: ChatModelSelection = "daily", signal = new AbortController().signal) => ({ model, signal,
  system: [{ type: "text" as const, text: "Principios del chef" }, { type: "text" as const, text: "Memoria breve" }],
  messages: [{ role: "user" as const, content: "Berenjena" }, { role: "assistant" as const, content: "Asada" }, { role: "user" as const, content: "Sin lácteos" }],
});
function body(text: string, split = 5) {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream<Uint8Array>({ start(c) {
    for (let i = 0; i < bytes.length; i += split) c.enqueue(bytes.slice(i, i + split));
    c.close();
  } });
}
const event = (chunk: unknown) => `data: ${JSON.stringify(chunk)}\r\n\r\n`;
const collect = async (iterator: AsyncIterable<ChatEvent>) => {
  const events: ChatEvent[] = [];
  for await (const value of iterator) events.push(value);
  return events;
};
beforeEach(() => {
  vi.mocked(reserveGeneration).mockReset().mockResolvedValue({ id: "reservation" } as never);
  vi.mocked(settleGeneration).mockClear();
  vi.stubEnv("GEMINI_API_KEY", "gemini-test"); vi.stubEnv("ANTHROPIC_API_KEY", "anthropic-test");
  opusStream.mockReset(); constructor.mockReset();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("Gemini chat adapter", () => {
  it("preserves context, streams UTF-8, hides thought parts and bills reasoning once", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(body(
      event({ candidates: [{ content: { parts: [{ text: "oculto", thought: true }, { text: "Limón " }] } }] }) +
      event({ candidates: [{ content: { parts: [{ text: "🍋" }] }, finishReason: "STOP" }],
        usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 30, thoughtsTokenCount: 50, cachedContentTokenCount: 20 } }), 1)));
    vi.stubGlobal("fetch", fetcher);
    const events = await collect(streamChat(input()));
    expect(events.filter(e => e.type === "delta").map(e => e.type === "delta" && e.text).join("")).toBe("Limón 🍋");
    expect(events.find(e => e.type === "usage")).toEqual({ type: "usage", usage: { inputTokens: 120, outputTokens: 80, reasoningTokens: 50, cachedTokens: 20 } });
    const [url, options] = fetcher.mock.calls[0]!;
    expect(url).toContain("gemini-3.8-flash:streamGenerateContent?alt=sse");
    expect(url).not.toContain("gemini-test");
    const request = JSON.parse(options.body);
    expect(request.systemInstruction.parts.map((p: { text: string }) => p.text)).toEqual(["Principios del chef", "Memoria breve"]);
    expect(request.contents.map((p: { role: string }) => p.role)).toEqual(["user", "model", "user"]);
    expect(request.generationConfig).toMatchObject({ maxOutputTokens: 8192, thinkingConfig: { thinkingLevel: "low", includeThoughts: false } });
    expect(opusStream).not.toHaveBeenCalled();
  });
  it.each(["MAX_TOKENS", undefined])("rejects a partial response finishing with %s", async finishReason => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body(event({ candidates: [{ content: { parts: [{ text: "Media receta" }] }, finishReason }] })))));
    await expect(collect(streamChat(input()))).rejects.toThrow("chat_response_incomplete");
  });
  it("rejects empty and blocked replies", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body(event({ promptFeedback: { blockReason: "SAFETY" } })))));
    await expect(collect(streamChat(input()))).rejects.toThrow("ai_response_blocked");
  });
  it("HTTP failure is not retried or routed to Opus", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("private provider details", { status: 429 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(collect(streamChat(input()))).rejects.toMatchObject({ code: "ai_rate_limited" });
    expect(fetcher).toHaveBeenCalledTimes(1); expect(opusStream).not.toHaveBeenCalled();
  });
  it("propagates cancellation upstream", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn(async (_url, options) => {
      controller.abort();
      expect(options.signal.aborted).toBe(true);
      throw new DOMException("Aborted", "AbortError");
    });
    vi.stubGlobal("fetch", fetcher);
    await expect(collect(streamChat(input("daily", controller.signal)))).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("Opus chat adapter", () => {
  it("uses explicit effort, no retries, cached prefixes and cumulative usage", async () => {
    opusStream.mockReturnValue({
      async *[Symbol.asyncIterator]() { yield { type: "content_block_delta", delta: { type: "text_delta", text: "Receta" } }; },
      finalMessage: async () => ({ stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 90, cache_creation_input_tokens: 20, cache_read_input_tokens: 30 } }),
    });
    const events = await collect(streamChat(input("creative")));
    expect(constructor).toHaveBeenCalledWith(expect.objectContaining({ maxRetries: 0 }));
    const request = opusStream.mock.calls[0]![0];
    expect(request).toMatchObject({ model: "claude-opus-5-5", max_tokens: 16384, output_config: { effort: "medium" } });
    expect(request.messages.at(-1).content[0].cache_control).toEqual({ type: "ephemeral" });
    expect(events.at(-1)).toMatchObject({ type: "usage", usage: { inputTokens: 60, outputTokens: 90, cachedTokens: 30 } });
  });
  it("retains consumed usage when a response is truncated", async () => {
    opusStream.mockReturnValue({
      async *[Symbol.asyncIterator]() { yield { type: "content_block_delta", delta: { type: "text_delta", text: "Incompleta" } }; },
      finalMessage: async () => ({ stop_reason: "max_tokens", usage: { input_tokens: 10, output_tokens: 16384 } }),
    });
    const events: ChatEvent[] = [];
    await expect((async () => { for await (const e of streamChat(input("opus"))) events.push(e); })()).rejects.toThrow("incomplete");
    expect(events.at(-1)).toMatchObject({ type: "usage", usage: { outputTokens: 16384 } });
  });
  it("tells a provider refusal apart from a truncated reply and still settles its usage", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    opusStream.mockReturnValue({
      async *[Symbol.asyncIterator]() {},
      finalMessage: async () => ({ stop_reason: "refusal", stop_details: { type: "refusal", category: "bio", explanation: null }, usage: { input_tokens: 10, output_tokens: 3 } }),
    });
    await expect(collect(streamChat(input("creative")))).rejects.toThrow("chat_refused");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"category":"bio"'));
    expect(settleGeneration).toHaveBeenCalledWith({ id: "reservation" }, expect.objectContaining({ inputTokens: 10, outputTokens: 3 }));
    warn.mockRestore();
  });
});

describe("A2 provider error normalization", () => {
  const anthropicFailure = async (error: Error, expectedCode: string, retryAfter?: number) => {
    opusStream.mockReturnValue({
      async *[Symbol.asyncIterator]() { throw error; },
      finalMessage: vi.fn(),
    });
    await expect(collect(streamChat(input("creative")))).rejects.toMatchObject({
      code: expectedCode,
      ...(retryAfter === undefined ? {} : { retryAfter }),
    });
    expect(settleGeneration).toHaveBeenCalledWith({ id: "reservation" }, undefined);
  };

  it("maps an Anthropic 429 to rate-limited with Retry-After seconds", async () => {
    const headers = new Headers({ "retry-after": "42" });
    const error = APIError.generate(429, { error: { type: "rate_limit_error", message: "private quota detail" } }, undefined, headers);
    expect(error).toBeInstanceOf(RateLimitError);
    await anthropicFailure(error, "ai_rate_limited", 42);
  });

  it.each([500, 529])("maps Anthropic HTTP %i to provider failure", async status => {
    const error = APIError.generate(status, { error: { type: status === 529 ? "overloaded_error" : "api_error", message: "private" } }, undefined, new Headers());
    expect(error).toBeInstanceOf(InternalServerError);
    await anthropicFailure(error, "ai_provider_failed");
  });

  it.each([400, 401, 403, 404])("maps Anthropic HTTP %i to provider failure", async status => {
    const logged = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const error = APIError.generate(status, { error: { type: "invalid_request_error", message: "private" } }, undefined, new Headers());
    const klass = { 400: BadRequestError, 401: AuthenticationError, 403: PermissionDeniedError, 404: NotFoundError }[status as 400 | 401 | 403 | 404];
    expect(error).toBeInstanceOf(klass);
    await anthropicFailure(error, "ai_provider_failed");
    expect(logged).toHaveBeenCalled();
    expect(inspect(logged.mock.calls, { depth: 8 })).not.toContain("Berenjena");
  });

  it("distinguishes Anthropic connection failure from SDK timeout", async () => {
    await anthropicFailure(new APIConnectionError({ message: "private network details" }), "ai_provider_failed");
    vi.mocked(settleGeneration).mockClear();
    await anthropicFailure(new APIConnectionTimeoutError({ message: "private timeout details" }), "ai_timeout");
  });

  it.each(["refusal", "max_tokens", "end_turn"])("keeps final Anthropic usage before rejecting %s", async stopReason => {
    opusStream.mockReturnValue({
      async *[Symbol.asyncIterator]() {},
      finalMessage: async () => ({ stop_reason: stopReason, usage: { input_tokens: 12, output_tokens: 8 } }),
    });
    const code = stopReason === "refusal" ? "chat_refused" : "chat_response_incomplete";
    await expect(collect(streamChat(input("creative")))).rejects.toMatchObject({ code });
    expect(settleGeneration).toHaveBeenCalledWith({ id: "reservation" }, expect.objectContaining({ inputTokens: 12, outputTokens: 8 }));
  });

  it.each([
    ["rate_limit_error", "ai_rate_limited"],
    ["overloaded_error", "ai_provider_failed"],
    ["api_error", "ai_provider_failed"],
    ["invalid_request_error", "ai_provider_failed"],
    ["authentication_error", "ai_provider_failed"],
    ["permission_error", "ai_provider_failed"],
    ["not_found_error", "ai_provider_failed"],
  ])("maps a midstream SDK APIError of type %s", async (type, code) => {
    // SDK core/streaming turns a wire SSE error into APIError(undefined,...)
    // and MessageStream rejects iteration; it is not a RawMessageStreamEvent.
    const error = new APIError(undefined, { error: { type, message: "secret upstream body" } }, undefined, new Headers({ "retry-after": "17" }), type as ConstructorParameters<typeof APIError>[4]);
    opusStream.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        yield { type: "message_start", message: { usage: { input_tokens: 19, output_tokens: 2 } } };
        yield { type: "content_block_delta", delta: { type: "text_delta", text: "Partial" } };
        throw error;
      },
      finalMessage: vi.fn(),
    });
    const received: ChatEvent[] = [];
    await expect((async () => { for await (const item of streamChat(input("creative"))) received.push(item); })()).rejects.toMatchObject({ code });
    expect(received).toContainEqual({ type: "delta", text: "Partial" });
    expect(received).toContainEqual({ type: "usage", usage: expect.objectContaining({ inputTokens: 19, outputTokens: 2 }) });
    expect(settleGeneration).toHaveBeenCalledWith({ id: "reservation" }, undefined);
  });

  it("maps a local deadline to timeout without changing client-abort semantics", async () => {
    const deadline = new AbortController();
    const spy = vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
    vi.stubGlobal("fetch", vi.fn((_url, options: RequestInit) => {
      return new Promise((_resolve, reject) => {
        options.signal?.addEventListener("abort", () => reject(new DOMException("deadline", "AbortError")), { once: true });
        deadline.abort();
      });
    }));
    await expect(collect(streamChat(input()))).rejects.toMatchObject({ code: "ai_timeout" });
  });

  it("maps the Anthropic local deadline to timeout without waiting for a real clock", async () => {
    const deadline = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
    opusStream.mockImplementation((_request, options: { signal: AbortSignal }) => ({
      async *[Symbol.asyncIterator]() {
        await new Promise((_resolve, reject) => {
          options.signal.addEventListener("abort", () => reject(new APIUserAbortError()), { once: true });
          deadline.abort();
        });
      },
      finalMessage: vi.fn(),
    }));
    await expect(collect(streamChat(input("creative")))).rejects.toMatchObject({ code: "ai_timeout" });
  });

  it("preserves an Anthropic client abort instead of converting it to a provider error", async () => {
    const controller = new AbortController();
    opusStream.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        controller.abort();
        throw new APIUserAbortError();
      },
      finalMessage: vi.fn(),
    });
    await expect(collect(streamChat(input("creative", controller.signal)))).rejects.toBeInstanceOf(APIUserAbortError);
  });

  it.each([[429, "ai_rate_limited"], [408, "ai_timeout"], [504, "ai_timeout"], [500, "ai_provider_failed"], [400, "ai_provider_failed"]])("maps Gemini HTTP %i", async (status, code) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private provider body", { status, headers: { "retry-after": "23" } })));
    await expect(collect(streamChat(input()))).rejects.toMatchObject({ code });
    expect(settleGeneration).toHaveBeenCalledWith({ id: "reservation" }, undefined);
  });

  it("logs Gemini HTTP status with bounded provider body, never the chef prompt", async () => {
    const logged = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("x".repeat(900), { status: 502 })));
    await expect(collect(streamChat(input()))).rejects.toMatchObject({ code: "ai_provider_failed" });
    const record = inspect(logged.mock.calls, { depth: 8, maxStringLength: 2_000 });
    expect(record).toContain("502");
    expect(record).toContain("x".repeat(100));
    expect(record).not.toContain("x".repeat(501));
    expect(record).not.toContain("Berenjena");
  });

  it.each(["SAFETY", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "RECITATION"])("maps Gemini finishReason %s to blocked", async finishReason => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body(event({
      candidates: [{ finishReason, content: { parts: [{ text: "Partial" }] } }],
      usageMetadata: { promptTokenCount: 23, candidatesTokenCount: 4 },
    })))));
    await expect(collect(streamChat(input()))).rejects.toMatchObject({ code: "ai_response_blocked" });
    expect(settleGeneration).toHaveBeenCalledWith({ id: "reservation" }, expect.objectContaining({ inputTokens: 23, outputTokens: 4 }));
  });

  it("maps Gemini promptFeedback blocking independently of chunk.error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body(event({ promptFeedback: { blockReason: "SAFETY" } })))));
    await expect(collect(streamChat(input()))).rejects.toMatchObject({ code: "ai_response_blocked" });
  });

  it("distinguishes Gemini chunk error from prompt blocking", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body(event({ error: { code: 500, message: "private" } })))));
    await expect(collect(streamChat(input()))).rejects.toMatchObject({ code: "ai_provider_failed" });
  });

  it.each([
    ["chunk error", { error: { code: 500, message: "private" } }, "ai_provider_failed"],
    ["prompt block", { promptFeedback: { blockReason: "SAFETY" } }, "ai_response_blocked"],
  ])("keeps partial Gemini usage visible before a %s without settling an incomplete record", async (_label, failingChunk, code) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body(
      event({ usageMetadata: { promptTokenCount: 13, candidatesTokenCount: 2 }, candidates: [{ content: { parts: [{ text: "Partial" }] } }] }) + event(failingChunk),
    ))));
    const received: ChatEvent[] = [];
    await expect((async () => { for await (const item of streamChat(input())) received.push(item); })()).rejects.toMatchObject({ code });
    expect(received).toContainEqual({ type: "usage", usage: expect.objectContaining({ inputTokens: 13, outputTokens: 2 }) });
    expect(received).toContainEqual({ type: "delta", text: "Partial" });
    expect(settleGeneration).toHaveBeenCalledWith({ id: "reservation" }, undefined);
  });

  it("keeps an empty Gemini HTTP body as an incomplete answer", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
    await expect(collect(streamChat(input()))).rejects.toMatchObject({ code: "chat_response_incomplete" });
  });

  it.each([
    ["malformed JSON", () => new Response(body("data: {not-json}\n\n"))],
    ["network exception", () => Promise.reject(new TypeError("private network details"))],
  ])("normalizes Gemini %s to a closed provider failure", async (_label, result) => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(result));
    await expect(collect(streamChat(input()))).rejects.toMatchObject({ code: "ai_provider_failed" });
  });

  it.each(["stream construction", "finalMessage"])("normalizes Anthropic %s failure", async stage => {
    if (stage === "stream construction") opusStream.mockImplementation(() => { throw new Error("private construction detail"); });
    else opusStream.mockReturnValue({ async *[Symbol.asyncIterator]() {}, finalMessage: async () => { throw new Error("private final detail"); } });
    await expect(collect(streamChat(input("creative")))).rejects.toMatchObject({ code: "ai_provider_failed" });
  });

  it("preserves complete Gemini usage even when MAX_TOKENS makes the answer incomplete", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body(event({
      candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: "Partial" }] } }],
      usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 7 },
    })))));
    await expect(collect(streamChat(input()))).rejects.toMatchObject({ code: "chat_response_incomplete" });
    expect(settleGeneration).toHaveBeenCalledWith({ id: "reservation" }, expect.objectContaining({ inputTokens: 11, outputTokens: 7 }));
  });
});

// Mensaje `i` de una conversación: los pares son del chef, los impares del asistente.
const turn = (i: number, size = 10): Msg => ({ role: i % 2 === 0 ? "user" : "assistant", content: `m${String(i).padStart(3, "0")}`.padEnd(size, ".") });
const absolute = (m: Msg) => Number(m.content.slice(1, 4));
// Lo que trae la ruta: los últimos `fetched` mensajes de una conversación de `total`.
const fetchedOf = (total: number, size = 10, fetched = 20) =>
  Array.from({ length: Math.min(total, fetched) }, (_, k) => turn(total - Math.min(total, fetched) + k, size));

describe("stableHistoryWindow", () => {
  it("sends everything while the conversation fits in 20 messages", () => {
    for (const total of [1, 2, 11, 20]) {
      const window = stableHistoryWindow(fetchedOf(total), total);
      expect(window.map(absolute)).toEqual(Array.from({ length: total }, (_, i) => i));
    }
  });
  it.each([21, 23, 25, 27, 29])("keeps the same first message at total %i so the cached prefix survives", total => {
    const window = stableHistoryWindow(fetchedOf(total), total);
    expect(absolute(window[0]!)).toBe(10);
    expect(absolute(window.at(-1)!)).toBe(total - 1);
    expect(window).toHaveLength(total - 10);
  });
  it("moves the anchor in one jump of 10: total 31 starts at absolute index 20", () => {
    const window = stableHistoryWindow(fetchedOf(31), 31);
    expect(absolute(window[0]!)).toBe(20);
    expect(window).toHaveLength(11);
  });
  it("never sends more than 20 messages", () => {
    for (let total = 1; total <= 101; total += 2) {
      expect(stableHistoryWindow(fetchedOf(total), total).length).toBeLessThanOrEqual(20);
    }
  });
  it("treats a total smaller than what was fetched as the fetched count", () => {
    expect(stableHistoryWindow(fetchedOf(5), 0).map(absolute)).toEqual([0, 1, 2, 3, 4]);
  });
  it("jumps to the next multiple of 10 when the block from the anchor exceeds the character budget", () => {
    // Desde el índice 10 hay 19 mensajes (190 caracteres); desde el 20, 9 (90).
    const window = stableHistoryWindow(fetchedOf(29), 29, { maxChars: 100 });
    expect(absolute(window[0]!)).toBe(20);
    expect(window.reduce((sum, m) => sum + m.content.length, 0)).toBeLessThanOrEqual(100);
  });
  it("falls back to the newest messages that fit when even the last block is too big", () => {
    // El último bloque (índices 20–28) suma 90 caracteres y no cabe en 45.
    const window = stableHistoryWindow(fetchedOf(29), 29, { maxChars: 45 });
    // Caben 25–28 (40 caracteres); el 25 es del asistente y se descarta.
    expect(window.map(absolute)).toEqual([26, 27, 28]);
  });
  it("drops a leading assistant message so the window starts with the chef", () => {
    const flipped = fetchedOf(21).map((m): Msg => ({ ...m, role: m.role === "user" ? "assistant" : "user" }));
    const window = stableHistoryWindow(flipped, 21);
    expect(window[0]).toMatchObject({ role: "user" });
    expect(window.map(absolute)).toEqual(Array.from({ length: 10 }, (_, i) => i + 11));
  });
  it("fails with chat_context_too_long when the newest message alone exceeds the budget", () => {
    expect(() => stableHistoryWindow([{ role: "user", content: "x".repeat(100) }], 1, { maxChars: 10 })).toThrow("chat_context_too_long");
    expect(() => stableHistoryWindow([], 0)).toThrow("chat_context_too_long");
  });
});

describe("bounded transport", () => {
  it("passes the authenticated owner to the budget guard and never starts a denied generation", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    vi.mocked(reserveGeneration).mockRejectedValueOnce(new Error("ai_budget_exhausted"));
    await expect(collect(streamChat({ ...input(), userId: "authenticated-user" }))).rejects.toThrow("ai_budget_exhausted");
    expect(reserveGeneration).toHaveBeenCalledWith(expect.objectContaining({ task: "daily" }), expect.any(Number), "authenticated-user");
    expect(fetcher).not.toHaveBeenCalled(); expect(opusStream).not.toHaveBeenCalled();
  });
  it("keeps the reservation after a connection fails, despite partial usage", async () => {
    opusStream.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        yield { type: "message_start", message: { usage: { input_tokens: 100, output_tokens: 1 } } };
        throw new Error("connection_lost");
      },
    });
    await expect(collect(streamChat(input("creative")))).rejects.toMatchObject({ code: "ai_provider_failed", cause: expect.objectContaining({ message: "connection_lost" }) });
    expect(settleGeneration).toHaveBeenCalledWith({ id: "reservation" }, undefined);
  });
  it("settles known final Opus usage even when the visible recipe is incomplete", async () => {
    opusStream.mockReturnValue({
      async *[Symbol.asyncIterator]() {},
      finalMessage: async () => ({ stop_reason: "max_tokens", usage: { input_tokens: 100, output_tokens: 16384, cache_creation_input_tokens: 50, cache_read_input_tokens: 20 } }),
    });
    await expect(collect(streamChat(input("creative")))).rejects.toThrow("chat_response_incomplete");
    expect(settleGeneration).toHaveBeenCalledWith({ id: "reservation" }, expect.objectContaining({ inputTokens: 170, outputTokens: 16384, cachedTokens: 20, cacheWriteTokens: 50 }));
  });
  it("keeps complete recent messages and removes an orphan assistant", () => {
    const history = [...input().messages, { role: "assistant" as const, content: "x".repeat(20) }, { role: "user" as const, content: "Última" }];
    expect(boundedChatHistory(history, 28)).toEqual([{ role: "user", content: "Última" }]);
    expect(() => boundedChatHistory([{ role: "user", content: "x".repeat(100) }], 10)).toThrow("context_too_long");
  });
  it("handles multiline SSE records and an unterminated last event", async () => {
    const records = [];
    for await (const data of sseData(body(': ping\r\ndata: {"x":\r\ndata: 1}\r\n\r\ndata: [DONE]', 1))) records.push(data);
    expect(records).toEqual(['{"x":\n1}', "[DONE]"]);
  });
});
