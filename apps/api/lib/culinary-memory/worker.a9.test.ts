import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CulinaryMemory } from "@atelier/db";
import type { Evidence } from "./evidence";
import type { MemoryGenerator } from "./provider";
import { evidenceHash } from "./evidence";
import { MEMORY_PROMPT_VERSION } from "./limits";

const { db, loadEvidence } = vi.hoisted(() => ({
  db: {
    culinaryMemory: { findUnique: vi.fn(), updateMany: vi.fn() },
    culinaryMemoryRun: { create: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(),
  },
  loadEvidence: vi.fn(),
}));
vi.mock("@atelier/db", () => ({ prisma: db, Prisma: { DbNull: "DB_NULL" } }));
vi.mock("./service", () => ({ loadEvidence, correctionsOf: (value: unknown) => value ?? [] }));

import { maintainMemoryRuns, memoryFailureFingerprint, processMemory } from "./worker";

const DAY = 86_400_000;
const WEEK = 7 * DAY;
const SLACK = 2 * 60 * 60 * 1000;
const now = new Date("2026-09-08T05:30:00Z");
const config = { provider: "fixture", model: "fixture" };
const failureOf = (inputHash: string) =>
  memoryFailureFingerprint({ inputHash, model: config.model, promptVersion: MEMORY_PROMPT_VERSION });
const originalEvidence: Evidence[] = [1, 2, 3].map(n => ({
  id: `recipe-${n}`, hash: `hash-${n}`, duplicateKey: `distinct-${n}`,
  legacyHashes: { approved: `approved-${n}`, in_test: `test-${n}` },
  state: "approved", title: `Recipe ${n}`, ingredients: ["tomato"], method: ["roast"],
}));

interface MemoryState extends CulinaryMemory {
  restaurant: { identityLine: string | null; languageDefault: string };
}
let state: MemoryState;
let sources: Evidence[];
let transactionActive: boolean;
let transactions: number;
let beforePublish: (() => void) | null;
let evidenceReads: boolean[];

// Exercise the real optimistic fences and timing gates instead of unconditionally
// returning count=1. Reads are snapshots, not aliases to subsequently mutated state.
function matches(where: Record<string, unknown>): boolean {
  const row = state as unknown as Record<string, unknown>;
  return Object.entries(where).every(([key, condition]) => {
    if (key === "AND" || key === "OR") {
      const clauses = Array.isArray(condition) ? condition : [condition];
      const results = clauses.map(clause => matches(clause as Record<string, unknown>));
      return key === "AND" ? results.every(Boolean) : results.some(Boolean);
    }
    const actual = row[key];
    if (condition === null || typeof condition !== "object" || condition instanceof Date) {
      return actual instanceof Date && condition instanceof Date ? +actual === +condition : actual === condition;
    }
    return Object.entries(condition).every(([operator, expected]) => {
      if (operator === "equals") return actual === expected;
      if (operator === "not") return actual !== expected;
      if (operator === "in") return (expected as unknown[]).includes(actual);
      if (!(actual instanceof Date) || !(expected instanceof Date)) return false;
      if (operator === "lte") return +actual <= +expected;
      if (operator === "lt") return +actual < +expected;
      if (operator === "gte") return +actual >= +expected;
      if (operator === "gt") return +actual > +expected;
      throw new Error(`Unsupported test predicate: ${operator}`);
    });
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  state = {
    restaurantId: "r1", enabled: true, version: 1, learned: [], corrections: [], excludedKeys: [],
    inputHash: null, lastFailedInputHash: null, failureCount: null, lastFailedAt: null, discardStreak: 0,
    preparedContext: null, preparedRevision: -1, preparedVersion: -1,
    dirtyRevision: 2, checkedRevision: 1, nextCheckAt: now, lastAttemptAt: null,
    cycleStartedAt: null, retryAt: null, updatedAt: null, lockToken: null, lockExpiresAt: null,
    restaurant: { identityLine: null, languageDefault: "en" },
  };
  sources = structuredClone(originalEvidence);
  transactionActive = false;
  transactions = 0;
  beforePublish = null;
  evidenceReads = [];
  db.culinaryMemory.findUnique.mockImplementation(async () => structuredClone(state));
  db.culinaryMemory.updateMany.mockImplementation(async ({ where, data }) => {
    if (!matches(where)) return { count: 0 };
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === "object" && "increment" in value) {
        Reflect.set(state, key, Number(Reflect.get(state, key) ?? 0) + Number(value.increment));
      } else {
        Reflect.set(state, key, structuredClone(value));
      }
    }
    return { count: 1 };
  });
  db.culinaryMemoryRun.create.mockResolvedValue({});
  db.culinaryMemoryRun.updateMany.mockResolvedValue({ count: 1 });
  db.culinaryMemoryRun.findMany.mockResolvedValue([]);
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => Promise<unknown>) => {
    if (++transactions === 2) beforePublish?.();
    const previous = structuredClone(state);
    transactionActive = true;
    try { return await fn(db); }
    catch (error) { state = previous; throw error; }
    finally { transactionActive = false; }
  });
  loadEvidence.mockImplementation(async () => {
    evidenceReads.push(transactionActive);
    return structuredClone(sources);
  });
});

const paidSuccess = () => vi.fn<MemoryGenerator>(async (_input, onUsage) => {
  await onUsage({ inputTokens: 30, outputTokens: 10, reasoningTokens: 0 });
  return { trends: [{ key: "techniques", text: "Roasted vegetables recur", sources: [1, 2, 3] }] };
});

describe("A9 publication races", () => {
  it("rechecks evidence inside publication and publishes a paid result against a moved but equivalent revision", async () => {
    // Move the revision only AFTER the existing pre-transaction evidence check.
    beforePublish = () => { state.dirtyRevision = 4; state.preparedContext = null; };
    const generate = paidSuccess();
    expect(await processMemory("r1", generate, config, now)).toBe("completed");
    expect(generate).toHaveBeenCalledOnce();
    expect(evidenceReads.at(-1)).toBe(true);
    expect(state).toMatchObject({
      dirtyRevision: 4, checkedRevision: 4, preparedRevision: 4, preparedVersion: 2,
      inputHash: evidenceHash(originalEvidence, null, [], []),
      learned: [{ key: "techniques", text: "Roasted vegetables recur", sources: originalEvidence.map(e => ({ id: e.id, hash: e.hash, version: 2 })) }],
      lockToken: null, lockExpiresAt: null,
    });
    expect(db.culinaryMemory.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ dirtyRevision: 4, version: 1, enabled: true, lockToken: expect.any(String) }),
      data: expect.objectContaining({ inputHash: expect.any(String) }),
    }));
  });

  it.each(["before publish", "inside publish"])("discards changed sources %s, reschedules promptly and does not charge twice in the tick", async timing => {
    const changeSources = () => {
      state.dirtyRevision++;
      sources = sources.map((e, index) => index ? e : { ...e, hash: "changed", method: ["steam"] });
    };
    const generate = paidSuccess();
    if (timing === "inside publish") beforePublish = changeSources;
    else generate.mockImplementationOnce(async (input, onUsage) => {
      const result = await paidSuccess()(input, onUsage);
      changeSources();
      return result;
    });
    expect(["superseded", "failed"]).toContain(await processMemory("r1", generate, config, now));
    expect(state.learned).toEqual([]);
    expect(state.inputHash).toBeNull();
    expect(+state.nextCheckAt).toBeLessThanOrEqual(+now);
    expect(generate).toHaveBeenCalledOnce();
    expect(db.culinaryMemoryRun.updateMany.mock.calls.some(([arg]) => arg.data.status === "completed")).toBe(false);

    beforePublish = null;
    expect(await processMemory("r1", generate, config, new Date(+now + DAY))).toBe("completed");
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("a superseded version releases its weekly slot without overwriting the newer version", async () => {
    beforePublish = () => { state.version = 2; state.dirtyRevision = 3; };
    const generate = paidSuccess();
    expect(await processMemory("r1", generate, config, now)).toBe("superseded");
    expect(state.version).toBe(2);
    expect(state.learned).toEqual([]);
    expect(+state.nextCheckAt).toBeLessThanOrEqual(+now);
    expect(generate).toHaveBeenCalledOnce();
    beforePublish = null;
    expect(await processMemory("r1", generate, config, new Date(+now + DAY))).toBe("completed");
  });

  it("never revives memory erased during a paid run even when its source hash is unchanged", async () => {
    beforePublish = () => { state.enabled = false; state.version++; state.dirtyRevision++; state.lockToken = null; };
    const generate = paidSuccess();
    expect(await processMemory("r1", generate, config, now)).toBe("superseded");
    expect(state.enabled).toBe(false);
    expect(state.learned).toEqual([]);
    expect(await processMemory("r1", generate, config, new Date(+now + DAY))).toBe("skipped");
    expect(generate).toHaveBeenCalledOnce();
  });
});

describe("A9 slack-aware scheduling", () => {
  const cronMinutes = [0, 29, 59].flatMap(previous => [0, 29, 59].map(current => [previous, current]));
  it.each(cronMinutes)("allows the next weekly cron at minute %i then %i through both the local and atomic claim gates", async (previous, current) => {
    const anchor = new Date(`2026-09-01T05:${String(previous).padStart(2, "0")}:00Z`);
    const nextCron = new Date(`2026-09-08T05:${String(current).padStart(2, "0")}:00Z`);
    state.lastAttemptAt = anchor;
    state.cycleStartedAt = anchor;
    state.nextCheckAt = new Date(+anchor + WEEK - SLACK);
    expect(+state.nextCheckAt).toBeLessThanOrEqual(+nextCron);
    const generate = paidSuccess();
    expect(await processMemory("r1", generate, config, nextCron)).toBe("completed");
    expect(generate).toHaveBeenCalledOnce();
    expect(state.nextCheckAt).toEqual(new Date(+nextCron + WEEK - SLACK));
  });

  it("keeps the weekly gate closed just before its slack boundary and schedules that boundary", async () => {
    const anchor = new Date(+now - WEEK + SLACK + 1);
    state.lastAttemptAt = anchor;
    state.cycleStartedAt = anchor;
    const generate = paidSuccess();
    expect(await processMemory("r1", generate, config, now)).toBe("skipped");
    expect(generate).not.toHaveBeenCalled();
    expect(state.nextCheckAt).toEqual(new Date(+anchor + WEEK - SLACK));
  });

  it.each(cronMinutes)("makes a transient retry due the next day with cron minutes %i then %i", async (previous, current) => {
    const anchor = new Date(`2026-09-08T05:${String(previous).padStart(2, "0")}:00Z`);
    const nextCron = new Date(`2026-09-09T05:${String(current).padStart(2, "0")}:00Z`);
    const generate = paidSuccess().mockRejectedValueOnce(new TypeError("fetch failed"));
    expect(await processMemory("r1", generate, config, anchor)).toBe("failed");
    expect(state.retryAt).toEqual(new Date(+anchor + DAY - SLACK));
    expect(state.nextCheckAt).toEqual(state.retryAt);
    expect(+state.nextCheckAt).toBeLessThanOrEqual(+nextCron);
    expect(await processMemory("r1", generate, config, nextCron)).toBe("completed");
    expect(db.culinaryMemoryRun.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({ isRetry: true }) });
    expect(state.nextCheckAt).toEqual(new Date(+nextCron + WEEK - SLACK));
  });

  it.each(["checked revision", "unchanged hash", "insufficient sources"])("schedules the next local check with daily slack for %s", async reason => {
    if (reason === "checked revision") state.checkedRevision = state.dirtyRevision;
    if (reason === "unchanged hash") state.inputHash = evidenceHash(sources, null, [], []);
    if (reason === "insufficient sources") sources = sources.slice(0, 1);
    const generate = paidSuccess();
    expect(await processMemory("r1", generate, config, now)).toBe("unchanged");
    expect(state.nextCheckAt).toEqual(new Date(+now + DAY - SLACK));
    expect(generate).not.toHaveBeenCalled();
  });

  it.each([false, true])("applies slack to abandoned-run recovery (paid=%s) without shortening retention", async paid => {
    const createdAt = new Date(+now - 10 * 60_000);
    state.lockToken = "abandoned";
    db.culinaryMemoryRun.findMany.mockResolvedValue([{
      id: "abandoned", restaurantId: "r1", createdAt, cycleStartedAt: createdAt, isRetry: false,
      inputTokens: paid ? 30 : 0, outputTokens: 0, reasoningTokens: 0,
    }]);
    await maintainMemoryRuns(now);
    expect(state.nextCheckAt).toEqual(new Date(+createdAt + (paid ? WEEK : DAY) - SLACK));
    expect(db.culinaryMemoryRun.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { createdAt: { lt: new Date(+now - 30 * DAY) }, publishedTrends: { not: "DB_NULL" } },
    }));
  });
});

describe("A9 deterministic input failures", () => {
  it("persists two failures, skips the same input without claiming or paying, and resumes when sources change", async () => {
    const hash = evidenceHash(sources, null, [], []);
    const generate = vi.fn<MemoryGenerator>(async (_input, onUsage) => {
      await onUsage({ inputTokens: 30, outputTokens: 10, reasoningTokens: 0 });
      return { trends: [], rejected: 1 };
    });
    for (const [cycle, count] of [[0, 1], [1, 2]]) {
      expect(await processMemory("r1", generate, config, new Date(+now + cycle! * WEEK))).toBe("failed");
      expect(state).toMatchObject({ lastFailedInputHash: failureOf(hash), failureCount: count, inputHash: null, learned: [] });
    }
    expect(await processMemory("r1", generate, config, new Date(+now + 2 * WEEK))).toBe("suppressed");
    expect(generate).toHaveBeenCalledTimes(2);
    expect(db.culinaryMemoryRun.create).toHaveBeenCalledTimes(2);

    state.dirtyRevision++;
    sources = sources.map((e, index) => index ? e : { ...e, hash: "new-input" });
    generate.mockImplementationOnce(paidSuccess());
    expect(await processMemory("r1", generate, config, new Date(+now + 2 * WEEK + DAY))).toBe("completed");
    expect(generate).toHaveBeenCalledTimes(3);
    expect(state.lastFailedInputHash).toBeNull();
    expect(state.failureCount ?? 0).toBe(0);
  });

  it("starts a fresh failure count when the input changes before it succeeds", async () => {
    state.lastFailedInputHash = failureOf(evidenceHash(sources, null, [], []));
    state.failureCount = 2;
    state.lastFailedAt = new Date(+now - DAY);
    sources = sources.map((e, index) => index ? e : { ...e, hash: "different-input" });
    const generate = vi.fn<MemoryGenerator>().mockResolvedValue({ trends: [], rejected: 1 });
    expect(await processMemory("r1", generate, config, now)).toBe("failed");
    expect(state).toMatchObject({ lastFailedInputHash: failureOf(evidenceHash(sources, null, [], [])), failureCount: 1 });
  });

  it("does not bypass identical-input suppression for a noisy dirty revision", async () => {
    state.lastFailedInputHash = failureOf(evidenceHash(sources, null, [], []));
    state.failureCount = 2;
    state.lastFailedAt = new Date(+now - DAY);
    state.dirtyRevision += 10;
    const generate = paidSuccess();
    expect(await processMemory("r1", generate, config, now)).toBe("suppressed");
    expect(generate).not.toHaveBeenCalled();
    expect(db.culinaryMemoryRun.create).not.toHaveBeenCalled();
  });

  it.each([false, true])("reports memory_input_limit correctly (usage persisted=%s)", async paid => {
    const generate = vi.fn<MemoryGenerator>(async (_input, onUsage) => {
      if (paid) await onUsage({ inputTokens: 30, outputTokens: 10, reasoningTokens: 0 });
      throw new Error("memory_input_limit");
    });
    expect(await processMemory("r1", generate, config, now)).toBe("failed");
    expect(db.culinaryMemoryRun.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "failed", errorCode: "memory_input_limit" }),
    }));
  });

  it.each(["ai_provider_http_503", "ai_budget_exhausted", "ai_provider_unconfigured"])("does not poison the input failure history for %s", async message => {
    const generate = vi.fn<MemoryGenerator>().mockRejectedValue(new Error(message));
    expect(await processMemory("r1", generate, config, now)).toBe("failed");
    expect(state.lastFailedInputHash).toBeNull();
    expect(state.failureCount ?? 0).toBe(0);
  });
});
