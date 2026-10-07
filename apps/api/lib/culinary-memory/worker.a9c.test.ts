import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CulinaryMemory } from "@atelier/db";
import type { Evidence } from "./evidence";
import { evidenceHash } from "./evidence";
import { generateMemory, type MemoryGenerator } from "./provider";
import { MEMORY_DISCARD_RETRY_LIMIT, MEMORY_FAILURE_SUSPENSION_THRESHOLD, MEMORY_PROMPT_VERSION } from "./limits";
import { maintainMemoryRuns, memoryFailureFingerprint, processMemory } from "./worker";

const { db, loadEvidence, reserveGeneration, logger } = vi.hoisted(() => ({
  db: {
    culinaryMemory: { findUnique: vi.fn(), updateMany: vi.fn() },
    culinaryMemoryRun: { create: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(),
  },
  loadEvidence: vi.fn(),
  reserveGeneration: vi.fn(),
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@atelier/db", () => ({ prisma: db, Prisma: { DbNull: "DB_NULL" } }));
vi.mock("./service", () => ({ loadEvidence, correctionsOf: (value: unknown) => value ?? [] }));
vi.mock("../ai/budget", () => ({ reserveGeneration, settleGeneration: vi.fn() }));
vi.mock("../logger", () => ({ logger }));

const DAY = 86_400_000;
const WEEK = 7 * DAY;
const now = new Date("2026-09-08T05:30:00Z");
const config = { provider: "zai", model: "glm-4.7-flash" };
const originalEvidence: Evidence[] = [1, 2, 3].map(n => ({
  id: `recipe-${n}`, hash: `hash-${n}`, duplicateKey: `distinct-${n}`,
  legacyHashes: { approved: `approved-${n}`, in_test: `test-${n}` },
  state: "approved", title: `Recipe ${n}`, ingredients: ["tomato"], method: ["roast"],
}));
const VALID = JSON.stringify({ trends: [{ key: "techniques", text: "Roasted vegetables recur", sources: [1, 2, 3] }] });
const REJECTED = JSON.stringify({ trends: [{ key: "bogus", text: "Not a memory category", sources: [1, 2, 3] }] });
const providerReply = (content: string) => Response.json({
  choices: [{ finish_reason: "stop", message: { content } }],
  usage: { prompt_tokens: 30, completion_tokens: 10 },
});
// Cut off by the provider after usage was recorded: a paid, non-discard failure.
const truncatedReply = () => Response.json({
  choices: [{ finish_reason: "length", message: { content: '{"trends":[' } }],
  usage: { prompt_tokens: 30, completion_tokens: 10 },
});

const provider = vi.fn();
interface MemoryState extends CulinaryMemory {
  restaurant: { identityLine: string | null; languageDefault: string };
}
let state: MemoryState;
let sources: Evidence[];
let changes = 0;

// The provider reply lands after the worker read the evidence, so the finished paid run is discarded.
function changeSourcesDuringNextProviderCall() {
  provider.mockImplementationOnce(async () => {
    state.dirtyRevision++;
    sources = sources.map((e, index) => index ? e : { ...e, hash: `changed-${++changes}`, method: ["steam"] });
    return providerReply(VALID);
  });
}

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
  vi.stubEnv("ZAI_API_KEY", "fixture-key");
  vi.stubEnv("CULINARY_MEMORY_MODEL", "glm-4.7-flash");
  vi.stubEnv("AI_GLM_MODEL", "");
  state = {
    restaurantId: "r1", enabled: true, version: 1, learned: [], corrections: [], excludedKeys: [],
    inputHash: null, lastFailedInputHash: null, failureCount: null, lastFailedAt: null, discardStreak: 0,
    preparedContext: null, preparedRevision: -1, preparedVersion: -1,
    dirtyRevision: 2, checkedRevision: 1, nextCheckAt: now, lastAttemptAt: null,
    cycleStartedAt: null, retryAt: null, updatedAt: null, lockToken: null, lockExpiresAt: null,
    restaurant: { identityLine: null, languageDefault: "en" },
  };
  sources = structuredClone(originalEvidence);
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
    const previous = structuredClone(state);
    try { return await fn(db); }
    catch (error) { state = previous; throw error; }
  });
  loadEvidence.mockImplementation(async () => structuredClone(sources));
  reserveGeneration.mockResolvedValue({ id: "reservation" });
  provider.mockImplementation(async () => providerReply(VALID));
  vi.stubGlobal("fetch", provider);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("A9c unpaid discards keep the previous cadence", () => {
  it("restores the prompt cadence and leaves the streak unchanged when an unpaid discard hits a streak at the limit", async () => {
    const previousAttempt = new Date(+now - 8 * DAY);
    state.discardStreak = MEMORY_DISCARD_RETRY_LIMIT;
    state.lastAttemptAt = previousAttempt;
    state.cycleStartedAt = previousAttempt;
    // The generator never reaches the provider reply path (no usage), and the sources change before publication.
    const generate = vi.fn<MemoryGenerator>(async () => {
      state.dirtyRevision++;
      sources = sources.map((e, index) => index ? e : { ...e, hash: "changed-unpaid" });
      return { trends: [] };
    });
    expect(await processMemory("r1", generate, config, now)).toBe("failed");
    expect(generate).toHaveBeenCalledOnce();
    expect(+state.nextCheckAt).toBeLessThanOrEqual(+now);
    expect(state).toMatchObject({
      discardStreak: MEMORY_DISCARD_RETRY_LIMIT, lastAttemptAt: previousAttempt, cycleStartedAt: previousAttempt, retryAt: null,
    });
  });
});

describe("A9c streak counts consecutive paid discards", () => {
  it("resets the streak after a non-discard failure so the next paid discard retries promptly", async () => {
    const next = new Date(+now + WEEK);
    // One paid discard short of the weekly fallback: only the reset keeps the next discard on the prompt retry.
    state.discardStreak = MEMORY_DISCARD_RETRY_LIMIT - 1;
    provider.mockImplementationOnce(async () => truncatedReply());
    expect(await processMemory("r1", generateMemory, config, now)).toBe("failed");
    expect(state.discardStreak).toBe(0);

    changeSourcesDuringNextProviderCall();
    expect(await processMemory("r1", generateMemory, config, next)).toBe("failed");
    expect(state.discardStreak).toBe(1);
    expect(+state.nextCheckAt).toBeLessThanOrEqual(+next);
  });

  it("resets the streak when an abandoned run is recovered", async () => {
    const createdAt = new Date(+now - 10 * 60_000);
    state.lockToken = "abandoned";
    state.discardStreak = MEMORY_DISCARD_RETRY_LIMIT;
    db.culinaryMemoryRun.findMany.mockResolvedValue([{
      id: "abandoned", restaurantId: "r1", createdAt, cycleStartedAt: createdAt, isRetry: false,
      inputTokens: 30, outputTokens: 0, reasoningTokens: 0,
    }]);
    await maintainMemoryRuns(now);
    expect(state).toMatchObject({ lockToken: null, discardStreak: 0 });
  });
});

describe("A9c rows written before A9b", () => {
  it("does not suppress a raw evidence-hash row and restarts the count under the fingerprint on a new deterministic failure", async () => {
    const hash = evidenceHash(sources, null, [], []);
    state.lastFailedInputHash = hash;
    state.failureCount = MEMORY_FAILURE_SUSPENSION_THRESHOLD;
    state.lastFailedAt = null;
    provider.mockImplementation(async () => providerReply(REJECTED));
    expect(await processMemory("r1", generateMemory, config, now)).toBe("failed");
    expect(provider).toHaveBeenCalledOnce();
    expect(state).toMatchObject({
      failureCount: 1,
      lastFailedInputHash: memoryFailureFingerprint({ inputHash: hash, model: config.model, promptVersion: MEMORY_PROMPT_VERSION }),
      lastFailedAt: now,
    });
  });
});
