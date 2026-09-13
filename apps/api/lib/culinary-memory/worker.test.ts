import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiBudgetError } from "../ai/budget-policy";

const { db, loadEvidence } = vi.hoisted(() => ({
  db: {
    culinaryMemory: { findUnique: vi.fn(), updateMany: vi.fn() },
    culinaryMemoryRun: { create: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
  loadEvidence: vi.fn(),
}));
vi.mock("@atelier/db", () => ({ prisma: db, Prisma: { DbNull: "DB_NULL" } }));
vi.mock("./service", () => ({ loadEvidence, correctionsOf: (v: unknown) => v ?? [] }));

import { maintainMemoryRuns, processMemory } from "./worker";

const DAY = 86_400_000;
const WEEK = 7 * DAY;
const now = new Date("2026-09-08T12:00:00Z");
const config = { model: "test", provider: "fixture", key: "test" };
const evidence = [1, 2, 3].map(n => ({ id: String(n), hash: `h${n}`, legacyHashes: { approved: `a${n}`, in_test: `t${n}` },
  duplicateKey: `d${n}`, state: "approved", title: "Recipe", ingredients: [], method: [] }));
const memory = (extra = {}) => ({ restaurantId: "r1", enabled: true, version: 1, dirtyRevision: 2, checkedRevision: 1,
  corrections: [], excludedKeys: [], inputHash: null, preparedContext: null, preparedRevision: -1, preparedVersion: -1,
  lockExpiresAt: null, lastAttemptAt: null, cycleStartedAt: null, retryAt: null,
  restaurant: { identityLine: null, languageDefault: "es" }, ...extra });
const successful = () => vi.fn().mockResolvedValue({ trends: [{ key: "techniques", text: "Tendencia", sources: [1, 2, 3] }] });

beforeEach(() => {
  vi.clearAllMocks();
  db.culinaryMemory.findUnique.mockResolvedValue(memory());
  db.culinaryMemory.updateMany.mockResolvedValue({ count: 1 });
  db.culinaryMemoryRun.updateMany.mockResolvedValue({ count: 1 });
  db.culinaryMemoryRun.findMany.mockResolvedValue([]);
  db.$transaction.mockImplementation((fn: (tx: typeof db) => unknown) => fn(db));
  loadEvidence.mockResolvedValue(evidence);
});

describe("weekly memory worker", () => {
  it("does not reserve or call without provider, sources or changes", async () => {
    const generate = vi.fn();
    expect(await processMemory("r1", generate, null, now)).toBe("unconfigured");
    loadEvidence.mockResolvedValueOnce(evidence.slice(0, 2));
    expect(await processMemory("r1", generate, config, now)).toBe("unchanged");
    db.culinaryMemory.findUnique.mockResolvedValueOnce(memory({ checkedRevision: 2 }));
    expect(await processMemory("r1", generate, config, now)).toBe("unchanged");
    expect(generate).not.toHaveBeenCalled();
    expect(db.culinaryMemoryRun.create).not.toHaveBeenCalled();
  });

  it("keeps the regular weekly cadence while a retry is not due", async () => {
    const generate = vi.fn();
    db.culinaryMemory.findUnique.mockResolvedValue(memory({
      lastAttemptAt: new Date(+now - DAY), cycleStartedAt: new Date(+now - DAY), retryAt: new Date(+now + 1),
    }));
    expect(await processMemory("r1", generate, config, now)).toBe("skipped");
    expect(generate).not.toHaveBeenCalled();
    expect(db.culinaryMemory.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { nextCheckAt: new Date(+now + 1) } }));
  });

  it("allows exactly one transient retry after 24h and records the real attempt time", async () => {
    const retryAt = new Date(+now - 1);
    const cycleStartedAt = new Date(+now - DAY);
    db.culinaryMemory.findUnique.mockResolvedValue(memory({ lastAttemptAt: cycleStartedAt, cycleStartedAt, retryAt }));
    expect(await processMemory("r1", successful(), config, now)).toBe("completed");
    expect(db.culinaryMemoryRun.create).toHaveBeenCalledWith({ data: expect.objectContaining({ isRetry: true, cycleStartedAt }) });
    const claim = db.culinaryMemory.updateMany.mock.calls.find(([arg]) => arg.data.lockToken)?.[0];
    expect(claim.data).toMatchObject({ lastAttemptAt: now, retryAt: null });
    expect(claim.data.nextCheckAt).toEqual(new Date(+now + WEEK));
  });

  it("schedules one 24h retry only for an eligible transient failure", async () => {
    expect(await processMemory("r1", vi.fn().mockRejectedValue(new TypeError("fetch failed")), config, now)).toBe("failed");
    expect(db.culinaryMemoryRun.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: "running" }),
      data: expect.objectContaining({ errorCode: "memory_provider_transient" }),
    }));
    expect(db.culinaryMemory.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ lockToken: expect.any(String) }),
      data: expect.objectContaining({ retryAt: new Date(+now + DAY), nextCheckAt: new Date(+now + DAY) }),
    }));
  });

  it("never schedules a second retry in the same cycle", async () => {
    const cycleStartedAt = new Date(+now - DAY);
    db.culinaryMemory.findUnique.mockResolvedValue(memory({ cycleStartedAt, lastAttemptAt: cycleStartedAt, retryAt: now }));
    await processMemory("r1", vi.fn().mockRejectedValue(new TypeError("fetch failed")), config, now);
    const schedules = db.culinaryMemory.updateMany.mock.calls.filter(([arg]) => arg.data.retryAt instanceof Date);
    expect(schedules).toHaveLength(0);
    expect(db.culinaryMemoryRun.create).toHaveBeenCalledWith({ data: expect.objectContaining({ isRetry: true }) });
  });

  it.each([
    ["budget", () => new AiBudgetError("ai_budget_exhausted"), "memory_budget_blocked"],
    ["invalid output", () => new Error("memory_response_incomplete"), "memory_output_invalid"],
    ["configuration", () => new Error("ai_provider_unconfigured"), "memory_configuration"],
  ])("does not retry %s failures", async (_label, makeError, code) => {
    await processMemory("r1", vi.fn().mockRejectedValue(makeError()), config, now);
    expect(db.culinaryMemoryRun.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ errorCode: code }) }));
    expect(db.culinaryMemory.updateMany.mock.calls.some(([arg]) => arg.data.retryAt instanceof Date)).toBe(false);
  });

  it("does not retry telemetry failure after a paid response", async () => {
    db.culinaryMemoryRun.updateMany.mockImplementation(async ({ data }) => {
      if ("inputTokens" in data) throw new Error("database unavailable");
      return { count: 1 };
    });
    const generate = vi.fn(async (_input, onUsage) => {
      await onUsage({ inputTokens: 10, outputTokens: 2, reasoningTokens: 0 });
      return { trends: [] };
    });
    await processMemory("r1", generate, config, now);
    expect(db.culinaryMemoryRun.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ errorCode: "memory_telemetry_failed" }) }));
    expect(db.culinaryMemory.updateMany.mock.calls.some(([arg]) => arg.data.retryAt instanceof Date)).toBe(false);
  });

  it("does not retry any local failure after confirmed provider usage", async () => {
    const generate = vi.fn(async (_input, onUsage) => {
      await onUsage({ inputTokens: 10, outputTokens: 2, reasoningTokens: 0 });
      throw new TypeError("local post-response failure");
    });
    await processMemory("r1", generate, config, now);
    expect(db.culinaryMemoryRun.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ errorCode: "memory_post_response_failed" }) }));
    expect(db.culinaryMemory.updateMany.mock.calls.some(([arg]) => arg.data.retryAt instanceof Date)).toBe(false);
  });

  it("does not retry invalid sources and never replaces prior content", async () => {
    const generate = vi.fn().mockResolvedValue({ trends: [{ key: "cuisine", text: "Tendencia", sources: [1, 2, 99] }] });
    expect(await processMemory("r1", generate, config, now)).toBe("failed");
    expect(db.culinaryMemoryRun.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ errorCode: "memory_output_invalid" }) }));
    expect(db.culinaryMemory.updateMany.mock.calls.some(([arg]) => "learned" in arg.data)).toBe(false);
  });

  it("publishes prepared context and minimal history with verified v2 sources", async () => {
    db.culinaryMemory.findUnique.mockResolvedValue(memory({ corrections: [{ key: "cuisine", text: "Vegetal" }], excludedKeys: ["ingredients"] }));
    const generate = vi.fn().mockResolvedValue({ trends: ["cuisine", "ingredients", "techniques"].map(key => ({ key, text: "Tendencia", sources: [1, 2, 3] })) });
    expect(await processMemory("r1", generate, config, now)).toBe("completed");
    const update = db.culinaryMemory.updateMany.mock.calls.find(([arg]) => "learned" in arg.data)![0];
    expect(update.data.learned).toEqual([{ key: "techniques", text: "Tendencia", sources: evidence.map(e => ({ id: e.id, hash: e.hash, version: 2 })) }]);
    expect(update.data).toMatchObject({ preparedRevision: 2, preparedVersion: 2, preparedContext: expect.stringContaining("Tendencia") });
    expect(update.where).toMatchObject({ restaurantId: "r1", version: 1, dirtyRevision: 2, lockToken: expect.any(String) });
    expect(db.culinaryMemoryRun.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      status: "completed", publishedTrends: [{ key: "techniques", text: "Tendencia" }],
    }) }));
    const publishOrder = db.culinaryMemory.updateMany.mock.invocationCallOrder[db.culinaryMemory.updateMany.mock.calls.indexOf(
      db.culinaryMemory.updateMany.mock.calls.find(([arg]) => "learned" in arg.data)!,
    )]!;
    const receiptIndex = db.culinaryMemoryRun.updateMany.mock.calls.findIndex(([arg]) => arg.data.status === "completed");
    expect(publishOrder).toBeLessThan(db.culinaryMemoryRun.updateMany.mock.invocationCallOrder[receiptIndex]!);
  });

  it("cannot publish or rewrite a run after ownership was recovered", async () => {
    db.culinaryMemory.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 }).mockResolvedValue({ count: 0 });
    expect(await processMemory("r1", successful(), config, now)).toBe("superseded");
    const attempted = db.culinaryMemory.updateMany.mock.calls.find(([arg]) => "learned" in arg.data)![0];
    expect(attempted.where).toMatchObject({ lockToken: expect.any(String), version: 1, dirtyRevision: 2 });
    expect(db.culinaryMemoryRun.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: "running" }), data: expect.objectContaining({ status: "superseded" }),
    }));
    expect(db.culinaryMemoryRun.updateMany.mock.calls.some(([arg]) => arg.data.status === "completed")).toBe(false);
  });

  it("passes the deadline signal to the provider", async () => {
    const controller = new AbortController();
    const generate = vi.fn().mockResolvedValue({ trends: [] });
    await processMemory("r1", generate, config, now, controller.signal);
    expect(generate.mock.calls[0]![0].signal).toBe(controller.signal);
  });
});

describe("memory run maintenance", () => {
  it("expires 30-day trend history and atomically recovers abandoned regular and retry runs", async () => {
    const regularAt = new Date(+now - 10 * 60_000);
    const retryCycle = new Date(+now - 2 * DAY);
    db.culinaryMemoryRun.findMany.mockResolvedValue([
      { id: "regular", restaurantId: "r1", createdAt: regularAt, isRetry: false, cycleStartedAt: regularAt, inputTokens: 0, outputTokens: 0, reasoningTokens: 0 },
      { id: "retry", restaurantId: "r2", createdAt: regularAt, isRetry: true, cycleStartedAt: retryCycle, inputTokens: 0, outputTokens: 0, reasoningTokens: 0 },
      { id: "paid", restaurantId: "r3", createdAt: regularAt, isRetry: false, cycleStartedAt: regularAt, inputTokens: 10, outputTokens: 2, reasoningTokens: 0 },
    ]);
    await maintainMemoryRuns(now);
    expect(db.culinaryMemoryRun.updateMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: new Date(+now - 30 * DAY) }, publishedTrends: { not: "DB_NULL" } },
      data: { publishedTrends: "DB_NULL" },
    });
    expect(db.culinaryMemoryRun.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "regular", status: "running" }, data: expect.objectContaining({ errorCode: "memory_worker_interrupted" }),
    }));
    expect(db.culinaryMemory.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { restaurantId: "r1", lockToken: "regular" },
      data: expect.objectContaining({ lockToken: null, retryAt: new Date(+regularAt + DAY), nextCheckAt: new Date(+regularAt + DAY) }),
    }));
    expect(db.culinaryMemory.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { restaurantId: "r2", lockToken: "retry" },
      data: expect.objectContaining({ lockToken: null, retryAt: null, nextCheckAt: new Date(+regularAt + WEEK) }),
    }));
    expect(db.culinaryMemory.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { restaurantId: "r3", lockToken: "paid" },
      data: expect.objectContaining({ lockToken: null, retryAt: null, nextCheckAt: new Date(+regularAt + WEEK) }),
    }));
    expect(db.culinaryMemoryRun.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "paid", status: "running" }, data: expect.objectContaining({ errorCode: "memory_worker_interrupted_after_response" }),
    }));
  });
});
