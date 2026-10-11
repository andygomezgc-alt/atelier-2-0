import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async () => "test-token"),
}));

// The mock factory cannot close over outer variables (it is hoisted), so the
// MockEventSource class lives entirely inside it. We expose the latest
// instance + ctor args via static fields and re-import the mocked module in
// each test to read them.
vi.mock("react-native-sse", () => {
  type Listener = (event: any) => void;
  class MockEventSource {
    static lastInstance: MockEventSource | null = null;
    static constructorArgs: { url: string; options: any } | null = null;
    url: string;
    options: any;
    closed = false;
    listeners: Record<string, Listener[]> = { message: [], error: [], open: [], close: [] };
    constructor(url: string, options: any) {
      this.url = url;
      this.options = options;
      MockEventSource.lastInstance = this;
      MockEventSource.constructorArgs = { url, options };
    }
    addEventListener(type: string, listener: Listener) {
      (this.listeners[type] ??= []).push(listener);
    }
    removeEventListener(type: string, listener: Listener) {
      this.listeners[type] = (this.listeners[type] ?? []).filter((l) => l !== listener);
    }
    removeAllEventListeners() {
      this.listeners = { message: [], error: [], open: [], close: [] };
    }
    close() {
      this.closed = true;
    }
    emit(type: string, event: any) {
      (this.listeners[type] ?? []).slice().forEach((l) => l(event));
    }
  }
  return { default: MockEventSource };
});

// Helpers to fetch the mock class from the mocked module.
async function getMock() {
  const mod = (await import("react-native-sse")) as unknown as {
    default: {
      lastInstance: any;
      constructorArgs: { url: string; options: any } | null;
    };
  };
  return mod.default;
}

import {
  bulkAddMessages,
  getConversationByIdea,
  listMessages,
  parseSseEvent,
  stopMessage,
  streamMessage,
  StreamInterruptedError,
  StreamTimeoutError,
} from "../conversations";
import { setUnauthorizedHandler } from "../client";

afterEach(async () => {
  const M = await getMock();
  M.lastInstance = null;
  M.constructorArgs = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  setUnauthorizedHandler(null);
});

describe("parseSseEvent", () => {
  it("returns delta event for valid delta payload", () => {
    expect(parseSseEvent('{"type":"delta","text":"hola"}')).toEqual({ type: "delta", text: "hola" });
  });
  it("returns done event", () => {
    expect(parseSseEvent('{"type":"done","inputTokens":10}')).toEqual({ type: "done" });
  });
  it("returns error event with message", () => {
    expect(parseSseEvent('{"type":"error","message":"boom"}')).toEqual({ type: "error", message: "boom" });
  });
  it("preserves a closed code and retryAfter while retaining message fallback", () => {
    expect(parseSseEvent('{"type":"error","code":"ai_rate_limited","message":"fallback","retryAfter":35}')).toEqual({
      type: "error", code: "ai_rate_limited", message: "fallback", retryAfter: 35,
    });
    expect(parseSseEvent('{"type":"error","code":"made_up","message":"legacy","retryAfter":-5}')).toEqual({
      type: "error", message: "legacy",
    });
  });
  it("returns null for non-JSON", () => {
    expect(parseSseEvent("ping")).toBeNull();
  });
  it("returns null for unknown type", () => {
    expect(parseSseEvent('{"type":"unknown"}')).toBeNull();
  });
  // A-05 — heartbeat: el server lo manda cada 8s mientras espera el 1er delta.
  it("returns heartbeat event with ts", () => {
    expect(parseSseEvent('{"type":"heartbeat","ts":1700000000000}')).toEqual({
      type: "heartbeat",
      ts: 1_700_000_000_000,
    });
  });
  it("returns null for heartbeat without ts", () => {
    expect(parseSseEvent('{"type":"heartbeat"}')).toBeNull();
  });
  it("returns null for delta with non-string text", () => {
    expect(parseSseEvent('{"type":"delta","text":42}')).toBeNull();
  });
});

describe("streamMessage", () => {
  it("delivers chunks to onDelta and resolves with full text on done", async () => {
    const M = await getMock();
    const onDelta = vi.fn();
    const promise = streamMessage("conv-1", "hi", "sonnet", onDelta);

    await new Promise((r) => setImmediate(r));
    expect(M.lastInstance).not.toBeNull();
    expect(M.constructorArgs?.options.method).toBe("POST");
    expect(M.constructorArgs?.options.headers.Authorization).toBe("Bearer test-token");

    M.lastInstance.emit("message", { type: "message", data: '{"type":"delta","text":"Hola"}' });
    M.lastInstance.emit("message", { type: "message", data: '{"type":"delta","text":" mundo"}' });
    M.lastInstance.emit("message", { type: "message", data: '{"type":"done"}' });

    const full = await promise;
    expect(onDelta).toHaveBeenCalledWith("Hola");
    expect(onDelta).toHaveBeenCalledWith(" mundo");
    expect(full).toBe("Hola mundo");
    expect(M.lastInstance.closed).toBe(true);
  });

  it("rejects with the partial text on transport-end after deltas (no explicit done)", async () => {
    const M = await getMock();
    const onDelta = vi.fn();
    const promise = streamMessage("conv-1", "hi", "sonnet", onDelta);
    const assertion = promise.catch((error: unknown) => {
      expect(error).toBeInstanceOf(StreamInterruptedError);
      expect(error).toMatchObject({ partialText: "part" });
    });
    await new Promise((r) => setImmediate(r));
    M.lastInstance.emit("message", { type: "message", data: '{"type":"delta","text":"part"}' });
    M.lastInstance.emit("error", { type: "error", xhrStatus: 200, message: "" });
    await assertion;
    expect(M.lastInstance.closed).toBe(true);
  });

  it("reuses the same clientMessageId when the logical send is retried", async () => {
    const M = await getMock();
    const clientMessageId = "client-1712345678-abcd";

    const first = streamMessage(
      "conv-1",
      "hi",
      "sonnet",
      vi.fn(),
      undefined,
      undefined,
      clientMessageId,
    );
    await new Promise((r) => setImmediate(r));
    const firstBody = JSON.parse(M.constructorArgs?.options.body ?? "{}");
    M.lastInstance.emit("message", { type: "message", data: '{"type":"done"}' });
    await first;

    const retry = streamMessage(
      "conv-1",
      "hi",
      "sonnet",
      vi.fn(),
      undefined,
      undefined,
      clientMessageId,
    );
    await new Promise((r) => setImmediate(r));
    const retryBody = JSON.parse(M.constructorArgs?.options.body ?? "{}");
    M.lastInstance.emit("message", { type: "message", data: '{"type":"done"}' });
    await retry;

    expect(firstBody.clientMessageId).toBe(clientMessageId);
    expect(retryBody.clientMessageId).toBe(clientMessageId);
  });

  it("rejects with StreamTimeoutError when no events arrive in window", async () => {
    vi.useFakeTimers();
    const M = await getMock();
    const promise = streamMessage("conv-1", "hi", "sonnet", vi.fn());
    // Attach the assertion before advancing timers so the rejection always
    // has a handler when it fires.
    const assertion = expect(promise).rejects.toBeInstanceOf(StreamTimeoutError);
    await vi.advanceTimersByTimeAsync(0);
    expect(M.lastInstance).not.toBeNull();
    await vi.advanceTimersByTimeAsync(36_000);
    await assertion;
    expect(M.lastInstance.closed).toBe(true);
  });

  it("rejects with AbortError when signal is aborted mid-stream", async () => {
    const M = await getMock();
    const ac = new AbortController();
    const promise = streamMessage("conv-1", "hi", "sonnet", vi.fn(), ac.signal);
    await new Promise((r) => setImmediate(r));
    M.lastInstance.emit("message", { type: "message", data: '{"type":"delta","text":"x"}' });
    ac.abort();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    expect(M.lastInstance.closed).toBe(true);
  });

  it("rejects immediately if signal is already aborted before connect", async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(streamMessage("conv-1", "hi", "sonnet", vi.fn(), ac.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it("rejects with stream error message on server-emitted error event", async () => {
    const M = await getMock();
    const promise = streamMessage("conv-1", "hi", "sonnet", vi.fn());
    await new Promise((r) => setImmediate(r));
    M.lastInstance.emit("message", { type: "message", data: '{"type":"error","message":"upstream_failed"}' });
    await expect(promise).rejects.toThrow("upstream_failed");
  });

  it("prefers a typed SSE code over legacy message and keeps retry metadata and partial text", async () => {
    const M = await getMock();
    const promise = streamMessage("conv-1", "recipe", "daily", vi.fn());
    const assertion = expect(promise).rejects.toMatchObject({
      name: "StreamInterruptedError", code: "ai_rate_limited", retryAfter: 35,
      partialText: "Partial", message: "ai_rate_limited",
    });
    await new Promise(resolve => setImmediate(resolve));
    M.lastInstance.emit("message", { data: '{"type":"delta","text":"Partial"}' });
    M.lastInstance.emit("message", { data: '{"type":"error","code":"ai_rate_limited","message":"private provider text","retryAfter":35}' });
    await assertion;
    expect(M.lastInstance.closed).toBe(true);
  });

  it("still uses a message from an older server that sends no code", async () => {
    const M = await getMock();
    const promise = streamMessage("conv-1", "recipe", "daily", vi.fn());
    const assertion = expect(promise).rejects.toMatchObject({ message: "legacy message", partialText: "" });
    await new Promise(resolve => setImmediate(resolve));
    M.lastInstance.emit("message", { data: '{"type":"error","message":"legacy message"}' });
    await assertion;
  });
});

describe("A3 stream transport errors and encoded ids", () => {
  it("signs out like apiFetch on a 401 and rejects without the raw JSON body", async () => {
    const M = await getMock();
    const unauthorized = vi.fn();
    setUnauthorizedHandler(unauthorized);
    const promise = streamMessage("conv-1", "hi", "daily", vi.fn());
    const assertion = expect(promise).rejects.toMatchObject({ name: "StreamInterruptedError", status: 401, message: "stream_error_401" });
    await new Promise(resolve => setImmediate(resolve));
    M.lastInstance.emit("error", { type: "error", xhrStatus: 401, message: '{"error":"Unauthorized"}' });
    await assertion;
    expect(unauthorized).toHaveBeenCalledTimes(1);
  });

  it("signs out exactly once on a stream 401 even when no token was sent", async () => {
    const M = await getMock();
    const SecureStore = await import("expo-secure-store");
    vi.mocked(SecureStore.getItemAsync).mockResolvedValueOnce(null);
    const unauthorized = vi.fn();
    setUnauthorizedHandler(unauthorized);
    const promise = streamMessage("conv-1", "hi", "daily", vi.fn());
    const assertion = expect(promise).rejects.toMatchObject({ name: "StreamInterruptedError", status: 401 });
    await new Promise(resolve => setImmediate(resolve));
    expect(M.lastInstance.options.headers.Authorization).toBeUndefined();
    M.lastInstance.emit("error", { type: "error", xhrStatus: 401, message: '{"error":"Unauthorized"}' });
    await assertion;
    expect(M.lastInstance.closed).toBe(true);
    expect(unauthorized).toHaveBeenCalledTimes(1);
  });

  it("does not sign out for other HTTP failures and keeps a closed code from the JSON body", async () => {
    const M = await getMock();
    const unauthorized = vi.fn();
    setUnauthorizedHandler(unauthorized);
    const promise = streamMessage("conv-1", "hi", "daily", vi.fn());
    const assertion = expect(promise).rejects.toMatchObject({ status: 429, code: "ai_daily_chat_limit", message: "ai_daily_chat_limit" });
    await new Promise(resolve => setImmediate(resolve));
    M.lastInstance.emit("error", { type: "error", xhrStatus: 429, message: '{"error":"limit","code":"ai_daily_chat_limit"}' });
    await assertion;
    expect(unauthorized).not.toHaveBeenCalled();
  });

  it("encodes the conversation id in the stream URL", async () => {
    const M = await getMock();
    const promise = streamMessage("a/b?c", "hi", "daily", vi.fn());
    await new Promise(resolve => setImmediate(resolve));
    expect(M.constructorArgs?.url).toMatch(/\/api\/conversations\/a%2Fb%3Fc\/messages$/);
    M.lastInstance.emit("message", { data: '{"type":"done"}' });
    await promise;
  });

  it("encodes ids in every REST path", async () => {
    const fetchMock = vi.fn(async () => new Response("[]", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await listMessages("a/b?c");
    await bulkAddMessages("a/b?c", [{ role: "user", content: "x" }]);
    await getConversationByIdea("i/d#1");
    const urls = fetchMock.mock.calls.map(call => String((call as unknown[])[0]));
    expect(urls[0]).toMatch(/\/api\/conversations\/a%2Fb%3Fc\/messages$/);
    expect(urls[1]).toMatch(/\/api\/conversations\/a%2Fb%3Fc\/messages\/bulk$/);
    expect(urls[2]).toMatch(/\/api\/ideas\/i%2Fd%231\/conversation$/);
  });
});

// A13 — stop and stopped events (RED: the stop request and the stopped event are not implemented yet).
describe("A13 stop", () => {
  it("parses the stopped event the server sends when a generation is stopped", () => {
    expect(parseSseEvent('{"type":"stopped"}')).toEqual({ type: "stopped" });
  });

  it("ends the stream as StreamStoppedError when the server reports it stopped", async () => {
    const M = await getMock();
    let outcome: { ok?: string; err?: { name?: string } } | null = null;
    const promise = streamMessage("conv-1", "hi", "daily", vi.fn());
    promise.then(
      (ok) => { outcome = { ok }; },
      (err: { name?: string }) => { outcome = { err }; },
    );
    await new Promise((r) => setImmediate(r));
    try {
      M.lastInstance.emit("message", { type: "message", data: '{"type":"delta","text":"Berenjena"}' });
      M.lastInstance.emit("message", { type: "message", data: '{"type":"stopped"}' });
      await new Promise((r) => setImmediate(r));
      expect(outcome).not.toBeNull();
      expect((outcome as { err?: { name?: string } } | null)?.err?.name).toBe("StreamStoppedError");
    } finally {
      // Settle the stream if it is still open, so its inactivity timer does not outlive the test.
      M.lastInstance.emit("message", { type: "message", data: '{"type":"done"}' });
    }
  });

  it("reports a 409 chat_in_progress reply with its code and status (the resume precondition)", async () => {
    const M = await getMock();
    const promise = streamMessage("conv-1", "hi", "daily", vi.fn());
    const assertion = expect(promise).rejects.toMatchObject({ name: "StreamInterruptedError", code: "chat_in_progress", status: 409 });
    await new Promise((r) => setImmediate(r));
    M.lastInstance.emit("error", { type: "error", xhrStatus: 409, message: '{"error":"chat_in_progress","code":"chat_in_progress"}' });
    await assertion;
  });

  it("POSTs the stop request for the conversation, encodes its id, and resolves on 204", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(stopMessage("a/b?c")).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/conversations\/a%2Fb%3Fc\/messages\/stop$/);
    expect(init.method).toBe("POST");
  });
});
