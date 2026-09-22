import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./budget", () => ({ reserveGeneration: vi.fn().mockResolvedValue({ id: "reservation" }), settleGeneration: vi.fn().mockResolvedValue(undefined) }));
const { opusStream, constructor } = vi.hoisted(() => ({ opusStream: vi.fn(), constructor: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({ default: class {
  messages = { stream: opusStream };
  constructor(options: unknown) { constructor(options); }
} }));
import { boundedChatHistory, sseData, streamChat, type ChatEvent } from "./chat";
import type { ChatModelSelection } from "@atelier/shared";
import { reserveGeneration, settleGeneration } from "./budget";

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
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

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
  it.each(["MAX_TOKENS", "SAFETY", undefined])("rejects a partial response finishing with %s", async finishReason => {
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
    await expect(collect(streamChat(input()))).rejects.toThrow("ai_provider_http_429");
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
    await expect(collect(streamChat(input("creative")))).rejects.toThrow("connection_lost");
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
