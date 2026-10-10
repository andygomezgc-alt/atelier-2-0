import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { can, type Permission } from "@atelier/shared";
import type { Reservation } from "@/lib/ai/budget";
import { logger } from "@/lib/logger";
import * as route from "../route";
import * as stopRoute from "../stop/route";

const { db, auth, guard, budget, buildSystem, opusStream, afterMock, jobs, jobErrors } = vi.hoisted(() => ({
  db: {
    conversation: { findUnique: vi.fn(), updateMany: vi.fn() },
    message: { create: vi.fn(), findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn() },
    restaurant: { findUnique: vi.fn() }, recipe: { findMany: vi.fn() },
    chefNote: { findMany: vi.fn() }, user: { findUnique: vi.fn() }, $transaction: vi.fn(),
  },
  auth: { userId: "u1", restaurantId: "r1" as string | null, role: "chef_executive" as Parameters<typeof can>[0] },
  guard: vi.fn(),
  budget: { reserveGeneration: vi.fn(), releaseGeneration: vi.fn(), settleGeneration: vi.fn(), settleInterruptedGeneration: vi.fn() },
  buildSystem: vi.fn(), opusStream: vi.fn(), afterMock: vi.fn(),
  jobs: [] as Promise<unknown>[], jobErrors: [] as unknown[],
}));

vi.mock("next/server", async importOriginal => ({
  ...(await importOriginal<typeof import("next/server")>()), after: afterMock,
}));
vi.mock("@atelier/db", () => ({ prisma: db }));
vi.mock("@/lib/permissions-guard", () => ({
  requireAuth: guard, isNextResponse: (value: unknown) => value instanceof Response,
}));
vi.mock("@/lib/ai/budget", () => budget);
vi.mock("@/lib/ai-quota", () => ({ recordAiTokens: vi.fn(async () => undefined) }));
vi.mock("@/lib/culinary-memory/service", () => ({ chatMemory: vi.fn(async () => null) }));
vi.mock("@/lib/anthropic", async importOriginal => ({
  ...(await importOriginal<typeof import("@/lib/anthropic")>()), buildSystemBlocks: buildSystem,
}));
vi.mock("@anthropic-ai/sdk", async importOriginal => ({
  ...(await importOriginal<typeof import("@anthropic-ai/sdk")>()),
  default: class { messages = { stream: opusStream }; },
}));

const reservation: Reservation = {
  id: "a6-hold", budgetId: "pilot", micros: 100_000,
  rate: { input: .75, output: 3.75, cached: .075, cacheWrite: .75 },
};
const NOW = new Date("2026-10-07T10:00:00Z");
interface Conversation {
  id: string;
  restaurantId: string;
  authorId: string;
  generationId: string | null;
  generationStartedAt: Date | null;
  idea: { text: null };
}
interface StoredMessage {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  clientMessageId?: string;
  responseToId?: string;
}
interface LeaseUpdate {
  where: { id: string; restaurantId?: string; generationId?: string | null; OR?: unknown[] };
  data: { generationId: string | null; generationStartedAt?: Date | null };
}
let conversation: Conversation;
let stored: StoredMessage[];

// Drain microtasks without wall-clock sleeps; all provider progress is test-controlled.
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
const background = async () => { await flush(); await Promise.all(jobs); await flush(); };
const assistantMessages = () => stored.filter(message => message.role === "assistant");
function expectClosedExactlyOnce(kind: keyof Pick<typeof budget, "releaseGeneration" | "settleGeneration" | "settleInterruptedGeneration">) {
  expect(budget[kind]).toHaveBeenCalledTimes(1);
  for (const other of ["releaseGeneration", "settleGeneration", "settleInterruptedGeneration"] as const) {
    if (other !== kind) expect(budget[other]).not.toHaveBeenCalled();
  }
}
function request(signal = new AbortController().signal, id = "conv-1", model = "daily") {
  return new NextRequest(`https://t.local/api/conversations/${id}/messages`, {
    method: "POST", headers: { "content-type": "application/json" }, signal,
    body: JSON.stringify({ content: "Recipe", clientMessageId: "a6-client-message", model }),
  });
}
const post = (req = request(), id = "conv-1") => route.POST(req, { params: Promise.resolve({ id }) });
const stop = (id = "conv-1") => stopRoute.POST(
  new NextRequest(`https://t.local/api/conversations/${id}/messages/stop`, { method: "POST" }),
  { params: Promise.resolve({ id }) },
);

interface ProviderControl {
  finish: () => void;
}
const providers: ProviderControl[] = [];
function provider(model = "daily") {
  let signal: AbortSignal | undefined;
  let abortAt: number | undefined;
  let closed = false;
  let controller: ReadableStreamDefaultController<unknown>;
  const source = new ReadableStream<unknown>({ start(value) { controller = value; } });
  const reader = source.getReader();
  const push = (chunk: unknown) => { if (!closed) controller.enqueue(chunk); };
  const attach = (value: AbortSignal) => {
    signal = value;
    const abort = () => {
      abortAt = Date.now();
      if (!closed) { closed = true; controller.error(value.reason ?? new DOMException("Aborted", "AbortError")); }
    };
    if (value.aborted) abort();
    else value.addEventListener("abort", abort, { once: true });
  };
  const fetcher = vi.fn(async (_url: unknown, options: RequestInit) => {
    attach(options.signal!);
    const bytes = new ReadableStream<Uint8Array>({
      async pull(output) {
        try {
          const item = await reader.read();
          if (item.done) output.close();
          else output.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(item.value)}\n\n`));
        } catch (error) { output.error(error); }
      },
      cancel() { return reader.cancel().catch(() => undefined); },
    });
    return new Response(bytes);
  });
  vi.stubGlobal("fetch", fetcher);
  opusStream.mockImplementation((_payload: unknown, options: { signal: AbortSignal }) => {
    attach(options.signal);
    return {
      async *[Symbol.asyncIterator]() {
        while (true) {
          const item = await reader.read();
          if (item.done) return;
          yield item.value;
        }
      },
      finalMessage: async () => ({ stop_reason: "end_turn", usage: { input_tokens: 80, output_tokens: 13, cache_read_input_tokens: 20 } }),
    };
  });
  const partial = () => {
    if (model === "creative") {
      push({ type: "message_start", message: { usage: { input_tokens: 80, output_tokens: 3, cache_read_input_tokens: 20 } } });
      push({ type: "content_block_delta", delta: { type: "text_delta", text: "Recipe" } });
    } else push({
      candidates: [{ content: { parts: [{ text: "Recipe" }] } }],
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 3, cachedContentTokenCount: 20 },
    });
  };
  const finish = () => {
    if (closed) return;
    if (model === "creative") push({ type: "content_block_delta", delta: { type: "text_delta", text: " finished" } });
    else push({
      candidates: [{ content: { parts: [{ text: " finished" }] }, finishReason: "STOP" }],
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 11, thoughtsTokenCount: 2, cachedContentTokenCount: 20 },
    });
    closed = true;
    controller.close();
  };
  const fail = () => {
    if (!closed) { closed = true; controller.error(new Error("provider connection failed")); }
  };
  providers.push({ finish });
  return { partial, finish, fail, fetcher, get signal() { return signal; }, get abortAt() { return abortAt; } };
}

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(NOW);
  vi.stubEnv("GEMINI_API_KEY", "test-gemini"); vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic");
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  jobs.length = 0; jobErrors.length = 0; providers.length = 0;
  afterMock.mockReset().mockImplementation((task: Promise<unknown> | (() => unknown)) => {
    // Model waitUntil: the registered work is awaited even after response cancellation.
    const pending = Promise.resolve().then(() => typeof task === "function" ? task() : task);
    jobs.push(pending.catch(error => { jobErrors.push(error); }));
  });
  auth.userId = "u1"; auth.restaurantId = "r1"; auth.role = "chef_executive";
  guard.mockReset().mockImplementation(async (_req: NextRequest, permission?: Permission) => {
    if (permission && (!auth.restaurantId || !can(auth.role, permission)))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return { ...auth };
  });
  conversation = { id: "conv-1", restaurantId: "r1", authorId: "u1", generationId: null, generationStartedAt: null, idea: { text: null } };
  stored = [];
  db.conversation.findUnique.mockReset().mockImplementation(async ({ where }) => where.id === conversation.id ? { ...conversation } : null);
  db.conversation.updateMany.mockReset().mockImplementation(async ({ where, data }: LeaseUpdate) => {
    if (where.id !== conversation.id || (where.restaurantId && where.restaurantId !== conversation.restaurantId)) return { count: 0 };
    if (where.OR && conversation.generationId !== null) return { count: 0 };
    if (Object.hasOwn(where, "generationId") && where.generationId !== conversation.generationId) return { count: 0 };
    Object.assign(conversation, data);
    return { count: 1 };
  });
  db.$transaction.mockReset().mockImplementation(async callback => callback(db));
  db.message.create.mockReset().mockImplementation(async ({ data }: { data: Omit<StoredMessage, "id"> }) => {
    const row = { ...data, id: `message-${stored.length}` }; stored.push(row); return row;
  });
  db.message.findUnique.mockReset().mockImplementation(async ({ where }) => {
    if (where.responseToId) return stored.find(message => message.responseToId === where.responseToId) ?? null;
    return stored.find(message => message.clientMessageId === where.conversationId_clientMessageId.clientMessageId) ?? null;
  });
  db.message.findFirst.mockReset().mockImplementation(async () => stored.at(-1) ?? null);
  // Retried unanswered turns already have a user message in persisted history.
  db.message.findMany.mockReset().mockImplementation(async () => [...stored].reverse().map(({ role, content }) => ({ role, content })));
  db.message.count.mockReset().mockImplementation(async () => stored.length);
  db.restaurant.findUnique.mockReset().mockResolvedValue({ name: "Kitchen", identityLine: null });
  db.recipe.findMany.mockReset().mockResolvedValue([]); db.chefNote.findMany.mockReset().mockResolvedValue([]);
  db.user.findUnique.mockReset().mockResolvedValue({ languagePref: "en" });
  buildSystem.mockReset().mockReturnValue([{ type: "text", text: "sys" }]); opusStream.mockReset();
  budget.reserveGeneration.mockReset().mockResolvedValue(reservation);
  for (const close of [budget.releaseGeneration, budget.settleGeneration, budget.settleInterruptedGeneration]) close.mockReset().mockResolvedValue(undefined);
});
afterEach(async () => {
  // Always unblock a stream on RED; failed assertions must not strand async work.
  for (const control of providers) control.finish();
  await background();
  vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs();
});

describe("A6 connection-independent generation (real service and billing adapter)", () => {
  it.each(["daily", "creative"])("%s finishes, bills and replays once after request disconnect", async model => {
    const client = new AbortController(); const upstream = provider(model);
    const response = await post(request(client.signal, "conv-1", model));
    const reader = response.body!.getReader();
    upstream.partial(); await reader.read();
    client.abort(); await flush();
    const abortedOnDisconnect = upstream.signal?.aborted;
    upstream.finish(); await reader.cancel(); await background();

    expect(abortedOnDisconnect).toBe(false);
    expect(afterMock).toHaveBeenCalledTimes(1); expect(jobErrors).toEqual([]);
    expect(assistantMessages()).toHaveLength(1);
    expect(assistantMessages()[0]).toMatchObject({ content: "Recipe finished", responseToId: "message-0" });
    expect(conversation.generationId).toBeNull(); expect(conversation.generationStartedAt).toBeNull();
    expectClosedExactlyOnce("settleGeneration");
    expect(budget.settleGeneration).toHaveBeenCalledWith(reservation, expect.objectContaining({ inputTokens: 100, outputTokens: 13, cachedTokens: 20 }));
    const replay = await post(request(new AbortController().signal, "conv-1", model));
    expect(await replay.text()).toContain('"replayed":true');
    expect(assistantMessages()).toHaveLength(1); expect(budget.reserveGeneration).toHaveBeenCalledTimes(1);
    expect(model === "creative" ? opusStream : upstream.fetcher).toHaveBeenCalledTimes(1);
    expect(afterMock).toHaveBeenCalledTimes(1);
  });

  it.each(["conv-1"])("%s body cancellation swallows later enqueue failures without aborting or refunding", async id => {
    const upstream = provider(); const response = await post(request(undefined, id), id);
    const reader = response.body!.getReader(); upstream.partial(); await reader.read();
    await reader.cancel(); await flush();
    const abortedOnCancel = upstream.signal?.aborted;
    // Both the heartbeat and later provider deltas try to mirror to a closed stream.
    await vi.advanceTimersByTimeAsync(8_000);
    upstream.finish(); await background();
    expect(abortedOnCancel).toBe(false); expect(upstream.signal?.aborted).toBe(false);
    expect(afterMock).toHaveBeenCalledTimes(1); expect(jobErrors).toEqual([]);
    expectClosedExactlyOnce("settleGeneration");
    expect(assistantMessages()).toHaveLength(id === "preview" ? 0 : 1);
    expect(conversation.generationId).toBeNull();
  });

  it("rejects a concurrent retry with 409 until the disconnected turn has finished", async () => {
    const upstream = provider(); const response = await post();
    const reader = response.body!.getReader(); upstream.partial(); await reader.read(); await reader.cancel();
    // Keep the provider idle: cancellation must not release the running turn's fence.
    await flush(); const retry = await post(); const retryBody = await retry.text();
    upstream.finish(); await background();
    expect(retry.status).toBe(409); expect(JSON.parse(retryBody).code).toBe("chat_in_progress");
    expect(budget.reserveGeneration).toHaveBeenCalledTimes(1); expect(assistantMessages()).toHaveLength(1);
  });

  it("closes billing and the lease after a provider failure with no client left", async () => {
    const upstream = provider(); const response = await post();
    const reader = response.body!.getReader(); upstream.partial(); await reader.read(); await reader.cancel();
    upstream.fail(); await background();
    expect(jobErrors).toEqual([]); expect(assistantMessages()).toHaveLength(0);
    expect(conversation.generationId).toBeNull(); expectClosedExactlyOnce("settleInterruptedGeneration");
  });
});

describe("A6 preparation disconnects", () => {
  it.each(["history", "system"])("a disconnect during %s before reservation returns cleanly and releases only the lease", async stage => {
    const errorLog = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const client = new AbortController(); const upstream = provider();
    if (stage === "history") db.message.findMany.mockImplementationOnce(async () => { client.abort(); return []; });
    else buildSystem.mockImplementationOnce(() => { client.abort(); return [{ type: "text", text: "sys" }]; });
    const outcome: unknown = await post(request(client.signal)).catch(error => error);
    upstream.finish();
    if (outcome instanceof Response) await outcome.text();
    expect(outcome).toBeInstanceOf(Response);
    expect(outcome).toMatchObject({ status: 499 });
    expect(errorLog).not.toHaveBeenCalled();
    expect(budget.reserveGeneration).not.toHaveBeenCalled(); expect(budget.releaseGeneration).not.toHaveBeenCalled();
    expect(upstream.fetcher).not.toHaveBeenCalled(); expect(stored).toEqual([]);
    expect(conversation.generationId).toBeNull(); expect(conversation.generationStartedAt).toBeNull();
  });

  it("an already disconnected request never leaks AbortError or takes a lease", async () => {
    const errorLog = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const client = new AbortController(); client.abort(); const upstream = provider();
    const outcome: unknown = await post(request(client.signal)).catch(error => error);
    upstream.finish();
    if (outcome instanceof Response) await outcome.text();
    expect(outcome).toBeInstanceOf(Response); expect(db.conversation.updateMany).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ status: 499 }); expect(errorLog).not.toHaveBeenCalled();
    expect(budget.reserveGeneration).not.toHaveBeenCalled(); expect(stored).toEqual([]);
  });

  it.each(["reserve", "user save"])("a disconnect immediately after %s still saves and bills the complete answer", async stage => {
    const client = new AbortController(); const upstream = provider();
    if (stage === "reserve") budget.reserveGeneration.mockImplementationOnce(async () => { client.abort(); return reservation; });
    else {
      const create = db.message.create.getMockImplementation()!;
      db.message.create.mockImplementationOnce(async args => { const row = await create(args); client.abort(); return row; });
    }
    const outcome: unknown = await post(request(client.signal)).catch(error => error);
    upstream.partial(); upstream.finish();
    if (outcome instanceof Response) await outcome.text();
    await background();
    expect(outcome).toBeInstanceOf(Response); expect(jobErrors).toEqual([]);
    expect(afterMock).toHaveBeenCalledTimes(1); expect(upstream.signal?.aborted).toBe(false);
    expect(assistantMessages()).toHaveLength(1); expect(assistantMessages()[0]?.content).toBe("Recipe finished");
    expectClosedExactlyOnce("settleGeneration"); expect(conversation.generationId).toBeNull();
  });

  it("refunds and releases after a real user-write failure following a reserved disconnect", async () => {
    const client = new AbortController(); const upstream = provider();
    budget.reserveGeneration.mockImplementationOnce(async () => { client.abort(); return reservation; });
    db.message.create.mockRejectedValueOnce(new Error("database unavailable"));
    const outcome: unknown = await post(request(client.signal)).catch(error => error);
    if (outcome instanceof Response) await outcome.text();
    expect(outcome).not.toMatchObject({ name: "AbortError" });
    expectClosedExactlyOnce("releaseGeneration"); expect(budget.releaseGeneration).toHaveBeenCalledWith(reservation);
    expect(conversation.generationId).toBeNull(); expect(stored).toEqual([]); expect(upstream.fetcher).not.toHaveBeenCalled();
  });
});

describe("A6 server-side Stop", () => {
  it.each(["daily", "creative"])("%s detects Stop on the next 8-second heartbeat and interrupts known usage", async model => {
    const upstream = provider(model); const response = await post(request(undefined, "conv-1", model));
    const wire = response.text(); upstream.partial(); await flush();
    const oldGeneration = conversation.generationId;
    const outcome: unknown = await stop().catch(error => error);
    const clearedByStop = conversation.generationId;
    const readsBeforeHeartbeat = db.conversation.findUnique.mock.calls.length;
    await vi.advanceTimersByTimeAsync(7_999); const abortedEarly = upstream.signal?.aborted;
    await vi.advanceTimersByTimeAsync(1); const abortedOnHeartbeat = upstream.signal?.aborted;
    const readsOnHeartbeat = db.conversation.findUnique.mock.calls.length;
    upstream.finish(); const events = await wire; await background();

    expect(outcome).toBeInstanceOf(Response); expect((outcome as Response).status).toBe(204);
    expect(oldGeneration).toEqual(expect.any(String)); expect(clearedByStop).toBeNull();
    expect(abortedEarly).toBe(false); expect(abortedOnHeartbeat).toBe(true);
    expect(readsOnHeartbeat).toBeGreaterThan(readsBeforeHeartbeat);
    expect(events).toContain('"type":"stopped"'); expect(events.match(/"type":"stopped"/g)).toHaveLength(1);
    expect(events).not.toContain('"type":"done"'); expect(events).not.toContain('"type":"error"');
    expect(assistantMessages()).toHaveLength(0); expectClosedExactlyOnce("settleInterruptedGeneration");
    expect(budget.settleInterruptedGeneration).toHaveBeenCalledWith(reservation, expect.objectContaining({ inputTokens: 100, cachedTokens: 20 }));
    expect(conversation.generationId).toBeNull(); expect(jobErrors).toEqual([]);
  });

  it("a removed fence detected before provider dispatch refunds rather than generating", async () => {
    const upstream = provider(); const create = db.message.create.getMockImplementation()!;
    db.message.create.mockImplementationOnce(async args => {
      const row = await create(args);
      conversation.generationId = null; conversation.generationStartedAt = null;
      return row;
    });
    const response = await post(); upstream.finish(); const events = await response.text(); await background();
    expect(events).toContain('"type":"stopped"'); expect(events).not.toContain('"type":"done"');
    expect(upstream.fetcher).not.toHaveBeenCalled(); expect(assistantMessages()).toHaveLength(0);
    expectClosedExactlyOnce("releaseGeneration"); expect(budget.releaseGeneration).toHaveBeenCalledWith(reservation);
    expect(conversation.generationId).toBeNull();
  });

  it("checks ownership again before saving when Stop wins after the last heartbeat", async () => {
    const upstream = provider(); const response = await post(); const wire = response.text();
    upstream.partial(); await flush();
    const readsBeforeFinish = db.conversation.findUnique.mock.calls.length;
    // Simulate the Stop write without waiting for a heartbeat or the new route stub.
    conversation.generationId = null; conversation.generationStartedAt = null;
    upstream.finish(); const events = await wire; await background();
    expect(db.conversation.findUnique.mock.calls.length).toBeGreaterThan(readsBeforeFinish);
    expect(events).toContain('"type":"stopped"'); expect(events).not.toContain('"type":"done"');
    expect(events).not.toContain('"type":"error"'); expect(assistantMessages()).toHaveLength(0);
    // Final usage is already known; A4 must not replace it with an estimated ceiling.
    expectClosedExactlyOnce("settleGeneration"); expect(conversation.generationId).toBeNull();
  });

  it("the atomic finish fence still refuses a Stop racing the pre-save ownership check", async () => {
    const upstream = provider(); const response = await post(); const wire = response.text();
    upstream.partial(); await flush();
    db.$transaction.mockImplementationOnce(async callback => {
      conversation.generationId = null; conversation.generationStartedAt = null;
      return callback(db);
    });
    upstream.finish(); const events = await wire; await background();
    expect(events).toContain('"type":"stopped"'); expect(events).not.toContain('"type":"error"');
    expect(events).not.toContain('"type":"done"'); expect(assistantMessages()).toHaveLength(0);
    expectClosedExactlyOnce("settleGeneration"); expect(conversation.generationId).toBeNull();
  });

  it("keeps checking Stop after the response body has been cancelled", async () => {
    const upstream = provider(); const response = await post(); const reader = response.body!.getReader();
    upstream.partial(); await reader.read(); await reader.cancel(); await flush();
    const abortedOnDisconnect = upstream.signal?.aborted;
    conversation.generationId = null; conversation.generationStartedAt = null;
    await vi.advanceTimersByTimeAsync(8_000); const abortedOnStop = upstream.signal?.aborted;
    upstream.finish(); await background();
    expect(abortedOnDisconnect).toBe(false); expect(abortedOnStop).toBe(true);
    expect(assistantMessages()).toHaveLength(0); expectClosedExactlyOnce("settleInterruptedGeneration");
    expect(jobErrors).toEqual([]); expect(conversation.generationId).toBeNull();
  });

  it("does not leave a hold open when Stop interrupts dispatch before any usage arrives", async () => {
    const upstream = provider(); const response = await post(); const wire = response.text(); await flush();
    expect(upstream.fetcher).toHaveBeenCalledTimes(1); // Provider dispatched, not a pre-run cancellation.
    conversation.generationId = null; conversation.generationStartedAt = null;
    await vi.advanceTimersByTimeAsync(8_000); const abortedOnStop = upstream.signal?.aborted;
    upstream.finish(); const events = await wire; await background();
    expect(abortedOnStop).toBe(true); expect(events).toContain('"type":"stopped"');
    expect(assistantMessages()).toHaveLength(0); expect(conversation.generationId).toBeNull();
    // No proven final usage and no proof that dispatch generated nothing: close conservatively.
    expectClosedExactlyOnce("settleInterruptedGeneration"); expect(jobErrors).toEqual([]);
  });

  it("an old stopped worker cannot save or clear a replacement generation", async () => {
    const upstream = provider(); const response = await post(); const wire = response.text();
    upstream.partial(); await flush();
    conversation.generationId = "replacement-generation"; conversation.generationStartedAt = new Date();
    await vi.advanceTimersByTimeAsync(8_000); const aborted = upstream.signal?.aborted;
    upstream.finish(); const events = await wire; await background();
    expect(aborted).toBe(true); expect(events).toContain('"type":"stopped"');
    expect(assistantMessages()).toHaveLength(0); expect(conversation.generationId).toBe("replacement-generation");
    expectClosedExactlyOnce("settleInterruptedGeneration");
  });

  it.each([
    { role: "viewer", authorId: "u1", restaurantId: "r1", status: 403 },
    { role: "admin", authorId: "u1", restaurantId: "other", status: 404 },
    { role: "chef_executive", authorId: "other-author", restaurantId: "r1", status: 403 },
    { role: "sous_chef", authorId: "other-author", restaurantId: "r1", status: 403 },
    { role: "sous_chef", authorId: "u1", restaurantId: "r1", status: 204 },
    { role: "chef_executive", authorId: "u1", restaurantId: "r1", status: 204 },
    { role: "admin", authorId: "other-author", restaurantId: "r1", status: 204 },
  ] as const)("$role / author=$authorId / restaurant=$restaurantId returns $status", async ({ role, authorId, restaurantId, status }) => {
    auth.role = role; conversation.authorId = authorId; conversation.restaurantId = restaurantId;
    conversation.generationId = "running"; conversation.generationStartedAt = new Date();
    const response = await stop();
    expect(response.status).toBe(status); expect(guard).toHaveBeenCalledWith(expect.any(NextRequest), "capture_idea");
    if (status === 204) {
      expect(await response.text()).toBe(""); expect(conversation.generationId).toBeNull();
      expect(conversation.generationStartedAt).toBeNull();
    } else {
      expect(db.conversation.updateMany).not.toHaveBeenCalled(); expect(conversation.generationId).toBe("running");
      if (role === "viewer") expect(db.conversation.findUnique).not.toHaveBeenCalled();
    }
    expect(budget.reserveGeneration).not.toHaveBeenCalled(); expect(db.message.create).not.toHaveBeenCalled();
  });

  it("returns 404 for a missing conversation and 403 without a restaurant", async () => {
    expect((await stop("missing")).status).toBe(404);
    auth.restaurantId = null; expect((await stop()).status).toBe(403);
    expect(db.conversation.updateMany).not.toHaveBeenCalled();
  });

  it("is idempotent when no generation is running and after a successful Stop", async () => {
    expect((await stop()).status).toBe(204);
    conversation.generationId = "running"; conversation.generationStartedAt = new Date();
    expect((await stop()).status).toBe(204); expect((await stop()).status).toBe(204);
    expect(conversation.generationId).toBeNull(); expect(conversation.generationStartedAt).toBeNull();
    expect(db.message.create).not.toHaveBeenCalled(); expect(budget.releaseGeneration).not.toHaveBeenCalled();
  });
});

describe("A6b preview disconnect billing", () => {
  it.each([
    { disconnect: "request abort", hasUsage: false },
    { disconnect: "request abort", hasUsage: true },
    { disconnect: "body cancel", hasUsage: false },
    { disconnect: "body cancel", hasUsage: true },
  ])("$disconnect aborts an abandoned preview (known usage: $hasUsage)", async ({ disconnect, hasUsage }) => {
    const client = new AbortController(); const upstream = provider();
    const response = await post(request(client.signal, "preview"), "preview");
    const reader = response.body!.getReader();
    if (hasUsage) { upstream.partial(); await reader.read(); }
    await flush();
    expect(upstream.fetcher).toHaveBeenCalledTimes(1);
    expect(upstream.signal?.aborted).toBe(false);

    if (disconnect === "request abort") client.abort();
    else await reader.cancel();
    await flush();
    const abortedOnDisconnect = upstream.signal?.aborted;
    const closedOnDisconnect = budget.settleInterruptedGeneration.mock.calls.length;
    // Unblock the old implementation too: RED must not wait for its deadline.
    upstream.finish(); await reader.cancel(); await background();

    expect(abortedOnDisconnect).toBe(true);
    expect(closedOnDisconnect).toBe(1);
    expectClosedExactlyOnce("settleInterruptedGeneration");
    expect(budget.settleInterruptedGeneration).toHaveBeenCalledWith(reservation, expect.objectContaining({
      inputTokens: hasUsage ? 100 : budget.reserveGeneration.mock.calls[0]![1],
      cachedTokens: hasUsage ? 20 : 0,
    }));
    expect(stored).toEqual([]);
    expect(db.conversation.findUnique).not.toHaveBeenCalled();
    expect(db.conversation.updateMany).not.toHaveBeenCalled();
    expect(jobErrors).toEqual([]);
  });
});

describe("A6b transient ownership uncertainty", () => {
  it.each(["daily", "creative"])("%s warns and keeps generating after one failed heartbeat read", async model => {
    const warning = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    const errorLog = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const upstream = provider(model);
    const response = await post(request(undefined, "conv-1", model));
    const wire = response.text(); upstream.partial(); await flush();
    const failure = new Error("transient ownership database read failed");
    db.conversation.findUnique.mockRejectedValueOnce(failure);
    await vi.advanceTimersByTimeAsync(8_000);
    const abortedOnReadFailure = upstream.signal?.aborted;
    const readsAfterFailure = db.conversation.findUnique.mock.calls.length;
    await vi.advanceTimersByTimeAsync(8_000);
    const readsAfterRecovery = db.conversation.findUnique.mock.calls.length;
    upstream.finish(); const events = await wire; await background();

    expect(abortedOnReadFailure).toBe(false);
    expect(upstream.signal?.aborted).toBe(false);
    expect(readsAfterRecovery).toBeGreaterThan(readsAfterFailure);
    expect(warning).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ error: failure }));
    expect(errorLog).not.toHaveBeenCalled();
    expect(events).toContain('"type":"done"');
    expect(events).not.toContain('"type":"error"'); expect(events).not.toContain('"type":"stopped"');
    expect(assistantMessages()).toHaveLength(1);
    expect(assistantMessages()[0]?.content).toBe("Recipe finished");
    expect(conversation.generationId).toBeNull(); expectClosedExactlyOnce("settleGeneration");
    expect(jobErrors).toEqual([]);
  });

  it("still stops on confirmed ownership loss after a transient read failure", async () => {
    vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    const upstream = provider(); const response = await post();
    const wire = response.text(); upstream.partial(); await flush();
    db.conversation.findUnique.mockRejectedValueOnce(new Error("temporary database failure"));
    await vi.advanceTimersByTimeAsync(8_000);
    const abortedOnUncertainty = upstream.signal?.aborted;
    conversation.generationId = "replacement-generation";
    await vi.advanceTimersByTimeAsync(8_000);
    const abortedOnConfirmedLoss = upstream.signal?.aborted;
    upstream.finish(); const events = await wire; await background();

    expect(abortedOnUncertainty).toBe(false); expect(abortedOnConfirmedLoss).toBe(true);
    expect(events).toContain('"type":"stopped"'); expect(events).not.toContain('"code":"ai_provider_failed"');
    expect(assistantMessages()).toHaveLength(0);
    expect(conversation.generationId).toBe("replacement-generation");
    expectClosedExactlyOnce("settleInterruptedGeneration"); expect(jobErrors).toEqual([]);
  });
});

describe("A6b genuine preparation failures after disconnect", () => {
  it.each(["history", "system"])("logs the original %s failure instead of hiding it behind a clean 499", async stage => {
    const errorLog = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const client = new AbortController(); const upstream = provider();
    const failure = new Error(`${stage} preparation failed`);
    if (stage === "history") db.message.findMany.mockImplementationOnce(async () => { client.abort(); throw failure; });
    else buildSystem.mockImplementationOnce(() => { client.abort(); throw failure; });
    const response = await post(request(client.signal));
    const body = await response.json(); await background();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({ code: "ai_provider_failed" });
    expect(errorLog).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ error: failure }));
    expect(JSON.stringify(body)).not.toContain(failure.message);
    expect(budget.reserveGeneration).not.toHaveBeenCalled(); expect(budget.releaseGeneration).not.toHaveBeenCalled();
    expect(stored).toEqual([]); expect(conversation.generationId).toBeNull();
    expect(conversation.generationStartedAt).toBeNull();
    expect(upstream.fetcher).not.toHaveBeenCalled(); expect(afterMock).not.toHaveBeenCalled();
  });
});

describe("A6 request-start deadline", () => {
  it.each(["daily", "creative"])("%s includes preparation time and leaves a save margin before maxDuration", async model => {
    // Native AbortSignal.timeout is not driven by Vitest's clock; expose its timer.
    vi.spyOn(AbortSignal, "timeout").mockImplementation(ms => {
      const deadline = new AbortController();
      setTimeout(() => deadline.abort(new DOMException("Deadline", "TimeoutError")), ms);
      return deadline.signal;
    });
    const upstream = provider(model); const requestStart = Date.now();
    db.restaurant.findUnique.mockImplementationOnce(async () => {
      await vi.advanceTimersByTimeAsync(100_000); return { name: "Kitchen", identityLine: null };
    });
    const response = await post(request(undefined, "conv-1", model)); const wire = response.text();
    upstream.partial(); await flush();
    await vi.advanceTimersByTimeAsync(route.maxDuration * 1_000 - 100_000 - 1);
    const abortedBeforePlatformLimit = upstream.signal?.aborted;
    upstream.finish(); const events = await wire; await background();
    expect(abortedBeforePlatformLimit).toBe(true);
    expect(upstream.abortAt).toBeGreaterThan(requestStart + 100_000);
    expect(upstream.abortAt).toBeLessThan(requestStart + route.maxDuration * 1_000);
    expect(events).toContain('"code":"ai_timeout"'); expect(events).not.toContain('"type":"done"');
    expect(assistantMessages()).toHaveLength(0); expect(conversation.generationId).toBeNull();
    expectClosedExactlyOnce("settleInterruptedGeneration"); expect(jobErrors).toEqual([]);
  });

  it("does not dispatch with a fresh deadline after slow reservation exhausts the request budget", async () => {
    vi.spyOn(AbortSignal, "timeout").mockImplementation(ms => {
      const deadline = new AbortController();
      setTimeout(() => deadline.abort(new DOMException("Deadline", "TimeoutError")), ms);
      return deadline.signal;
    });
    const upstream = provider();
    budget.reserveGeneration.mockImplementationOnce(async () => {
      await vi.advanceTimersByTimeAsync(route.maxDuration * 1_000);
      return reservation;
    });
    const outcome: unknown = await post().catch(error => error);
    upstream.finish(); if (outcome instanceof Response) await outcome.text(); await background();
    expect(outcome).toBeInstanceOf(Response); expect(upstream.fetcher).not.toHaveBeenCalled();
    expect(assistantMessages()).toHaveLength(0); expect(conversation.generationId).toBeNull();
    expectClosedExactlyOnce("releaseGeneration"); expect(budget.releaseGeneration).toHaveBeenCalledWith(reservation);
  });
});
