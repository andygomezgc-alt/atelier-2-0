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

import { parseSseEvent, streamMessage, StreamTimeoutError } from "../conversations";

afterEach(async () => {
  const M = await getMock();
  M.lastInstance = null;
  M.constructorArgs = null;
  vi.useRealTimers();
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
  it("returns null for non-JSON", () => {
    expect(parseSseEvent("ping")).toBeNull();
  });
  it("returns null for unknown type", () => {
    expect(parseSseEvent('{"type":"unknown"}')).toBeNull();
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

  it("resolves with accumulated text on transport-end after deltas (no explicit done)", async () => {
    const M = await getMock();
    const onDelta = vi.fn();
    const promise = streamMessage("conv-1", "hi", "sonnet", onDelta);
    await new Promise((r) => setImmediate(r));
    M.lastInstance.emit("message", { type: "message", data: '{"type":"delta","text":"part"}' });
    M.lastInstance.emit("error", { type: "error", xhrStatus: 200, message: "" });
    expect(await promise).toBe("part");
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
});
