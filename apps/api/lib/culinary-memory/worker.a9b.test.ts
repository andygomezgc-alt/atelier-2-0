import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import type { CulinaryMemory } from "@atelier/db";
import type { Evidence } from "./evidence";
import { evidenceHash } from "./evidence";
import { generateMemory, type MemoryGenerator } from "./provider";
import {
  MEMORY_DISCARD_RETRY_LIMIT, MEMORY_FAILURE_SUSPENSION_THRESHOLD, MEMORY_PROMPT_VERSION, MEMORY_SUPPRESSION_EXPIRY_MS,
} from "./limits";
import * as workerModule from "./worker";
import { processMemory } from "./worker";

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
vi.mock("./service", () => ({ loadEvidence, loadIngredientStats: async () => [], correctionsOf: (value: unknown) => value ?? [] }));
vi.mock("../ai/budget", () => ({ reserveGeneration, settleGeneration: vi.fn() }));
vi.mock("../logger", () => ({ logger }));

const DAY = 86_400_000;
const HOUR = 3_600_000;
const WEEK = 7 * DAY;
const SLACK = 2 * HOUR;
const now = new Date("2026-09-08T05:30:00Z");
const config = { provider: "zai", model: "glm-4.7-flash" };
const originalEvidence: Evidence[] = [1, 2, 3].map(n => ({
  id: `recipe-${n}`, hash: `hash-${n}`, duplicateKey: `distinct-${n}`,
  legacyHashes: { approved: `approved-${n}`, in_test: `test-${n}` },
  state: "approved", title: `Recipe ${n}`, ingredients: ["tomato"], method: ["roast"],
}));
const VALID = JSON.stringify({ trends: [{ key: "techniques", text: "Roasted vegetables recur", sources: [1, 2, 3] }] });
// A well-formed reply whose only trend uses an unknown category: the worker rejects it as deterministic input output.
const REJECTED = JSON.stringify({ trends: [{ key: "bogus", text: "Not a memory category", sources: [1, 2, 3] }] });
const providerReply = (content: string) => Response.json({
  choices: [{ finish_reason: "stop", message: { content } }],
  usage: { prompt_tokens: 30, completion_tokens: 10 },
});

const provider = vi.fn();
interface MemoryState extends CulinaryMemory {
  restaurant: { identityLine: string | null; languageDefault: string };
}
let state: MemoryState;
let sources: Evidence[];

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
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

type FingerprintInput = { inputHash: string; model: string; promptVersion: string };
function memoryFailureFingerprint(input: FingerprintInput): string {
  const helper = (workerModule as unknown as { memoryFailureFingerprint?: (value: FingerprintInput) => string }).memoryFailureFingerprint;
  if (!helper) throw new Error("memoryFailureFingerprint is not exported from worker.ts yet");
  return helper(input);
}

describe("A9b failure fingerprint", () => {
  it("changes with the model and prompt version, not only with the input hash", () => {
    const base = { inputHash: "input-a", model: config.model, promptVersion: MEMORY_PROMPT_VERSION };
    const fingerprint = memoryFailureFingerprint(base);
    expect(memoryFailureFingerprint({ ...base })).toBe(fingerprint);
    expect(memoryFailureFingerprint({ ...base, inputHash: "input-b" })).not.toBe(fingerprint);
    expect(memoryFailureFingerprint({ ...base, model: "glm-5.3-flash" })).not.toBe(fingerprint);
    expect(memoryFailureFingerprint({ ...base, promptVersion: "previous-prompt" })).not.toBe(fingerprint);
  });
});

describe("A9b provider truncation is not a deterministic input failure", () => {
  it.each([
    ["memory_response_incomplete", () => new Error("memory_response_incomplete")],
    ["ai_response_incomplete", () => new Error("ai_response_incomplete")],
    ["ai_response_invalid", () => new Error("ai_response_invalid")],
    ["a ZodError from a truncated reply", () => new ZodError([])],
  ])("never counts %s toward suppression, so the provider keeps being called", async (_label, failure) => {
    const generate = vi.fn<MemoryGenerator>(async (_input, onUsage) => {
      await onUsage({ inputTokens: 30, outputTokens: 10, reasoningTokens: 0 });
      throw failure();
    });
    for (let index = 0; index <= MEMORY_FAILURE_SUSPENSION_THRESHOLD; index++) {
      expect(await processMemory("r1", generate, config, new Date(+now + index * WEEK))).toBe("failed");
      expect(state.failureCount ?? 0).toBe(0);
      expect(state.lastFailedInputHash).toBeNull();
    }
    expect(generate).toHaveBeenCalledTimes(MEMORY_FAILURE_SUSPENSION_THRESHOLD + 1);
  });
});

describe("A9b deterministic input failures", () => {
  it("counts a provider-rejected trend and stamps lastFailedAt on every counted failure", async () => {
    provider.mockImplementation(async () => providerReply(REJECTED));
    const second = new Date(+now + WEEK);
    expect(await processMemory("r1", generateMemory, config, now)).toBe("failed");
    expect(state).toMatchObject({ failureCount: 1, lastFailedAt: now });
    expect(await processMemory("r1", generateMemory, config, second)).toBe("failed");
    expect(state).toMatchObject({ failureCount: 2, lastFailedAt: second });
  });

  it("counts memory_input_limit as deterministic and stamps lastFailedAt", async () => {
    const generate = vi.fn<MemoryGenerator>().mockRejectedValue(new Error("memory_input_limit"));
    expect(await processMemory("r1", generate, config, now)).toBe("failed");
    expect(state).toMatchObject({ failureCount: 1, lastFailedAt: now });
  });

  it("suppresses the next identical failure with no provider call, budget reservation or failure write", async () => {
    provider.mockImplementation(async () => providerReply(REJECTED));
    const failures = MEMORY_FAILURE_SUSPENSION_THRESHOLD;
    for (let index = 0; index < failures; index++) {
      expect(await processMemory("r1", generateMemory, config, new Date(+now + index * WEEK))).toBe("failed");
    }
    const lastFailure = new Date(+now + (failures - 1) * WEEK);
    const suppressedAt = new Date(+now + failures * WEEK);
    expect(await processMemory("r1", generateMemory, config, suppressedAt)).toBe("suppressed");
    // Free to re-check, so it follows the daily cadence of an unchanged input and notices new input early.
    expect(state.nextCheckAt).toEqual(new Date(+suppressedAt + DAY - SLACK));
    expect(provider).toHaveBeenCalledTimes(failures);
    expect(reserveGeneration).toHaveBeenCalledTimes(failures);
    expect(db.culinaryMemoryRun.create).toHaveBeenCalledTimes(failures);
    expect(state).toMatchObject({ failureCount: failures, lastFailedAt: lastFailure });
    expect(logger.warn).toHaveBeenCalledOnce();
    const [message, context] = logger.warn.mock.calls[0]!;
    expect(context).toMatchObject({ restaurantId: "r1", failureCount: failures, fingerprint: expect.any(String) });
    expect(state.lastFailedInputHash?.startsWith(context.fingerprint)).toBe(true);
    expect(context.fingerprint.length).toBeLessThan(state.lastFailedInputHash!.length);
    const logged = JSON.stringify([message, context]);
    expect(logged).not.toContain("tomato");
    expect(logged).not.toContain("roast");
    expect(logged).not.toContain("Recipe 1");
  });

  it("runs the provider again after the model changes, although the failed input is identical", async () => {
    provider.mockImplementation(async () => providerReply(REJECTED));
    for (let index = 0; index < MEMORY_FAILURE_SUSPENSION_THRESHOLD; index++) {
      await processMemory("r1", generateMemory, config, new Date(+now + index * WEEK));
    }
    vi.stubEnv("CULINARY_MEMORY_MODEL", "glm-5.3-flash");
    const swapped = { provider: "zai", model: "glm-5.3-flash" };
    provider.mockImplementation(async () => providerReply(VALID));
    const after = new Date(+now + MEMORY_FAILURE_SUSPENSION_THRESHOLD * WEEK);
    expect(await processMemory("r1", generateMemory, swapped, after)).toBe("completed");
    expect(provider).toHaveBeenCalledTimes(MEMORY_FAILURE_SUSPENSION_THRESHOLD + 1);
    expect(JSON.parse(provider.mock.calls.at(-1)![1].body).model).toBe("glm-5.3-flash");
  });

  it("does not keep suppressing a failure recorded under an older prompt or parser version", async () => {
    state.lastFailedInputHash = memoryFailureFingerprint({
      inputHash: evidenceHash(sources, null, [], []), model: config.model, promptVersion: "previous-prompt",
    });
    state.failureCount = MEMORY_FAILURE_SUSPENSION_THRESHOLD;
    state.lastFailedAt = new Date(+now - DAY);
    expect(await processMemory("r1", generateMemory, config, now)).toBe("completed");
    expect(provider).toHaveBeenCalledOnce();
  });

  it("keeps suppression until MEMORY_SUPPRESSION_EXPIRY_MS after the last counted failure, then retries unchanged input", async () => {
    const last = new Date(+now + WEEK);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(last);
    provider.mockImplementation(async () => providerReply(REJECTED));
    await processMemory("r1", generateMemory, config, now);
    await processMemory("r1", generateMemory, config, last);
    expect(state.failureCount).toBe(MEMORY_FAILURE_SUSPENSION_THRESHOLD);

    provider.mockImplementation(async () => providerReply(VALID));
    const inside = new Date(+last + MEMORY_SUPPRESSION_EXPIRY_MS - 60_000);
    expect(await processMemory("r1", generateMemory, config, inside)).toBe("suppressed");
    expect(provider).toHaveBeenCalledTimes(MEMORY_FAILURE_SUSPENSION_THRESHOLD);

    const expired = new Date(+last + MEMORY_SUPPRESSION_EXPIRY_MS);
    vi.setSystemTime(expired);
    expect(await processMemory("r1", generateMemory, config, expired)).toBe("completed");
    expect(provider).toHaveBeenCalledTimes(MEMORY_FAILURE_SUSPENSION_THRESHOLD + 1);
  });
});

describe("A9b discarded paid runs", () => {
  let changes = 0;
  // The provider reply lands after the worker read the evidence, so the finished run is discarded.
  const changeSourcesDuringNextProviderCall = () => {
    provider.mockImplementationOnce(async () => {
      state.dirtyRevision++;
      sources = sources.map((e, index) => index ? e : { ...e, hash: `changed-${++changes}`, method: ["steam"] });
      return providerReply(VALID);
    });
  };

  it("reschedules the first discarded paid run for a prompt retry and counts the streak", async () => {
    changeSourcesDuringNextProviderCall();
    expect(await processMemory("r1", generateMemory, config, now)).toBe("failed");
    expect(state).toMatchObject({ learned: [], retryAt: null, discardStreak: 1 });
    expect(+state.nextCheckAt).toBeLessThanOrEqual(+now);
    expect(provider).toHaveBeenCalledOnce();
  });

  it("falls back to the weekly cadence once MEMORY_DISCARD_RETRY_LIMIT paid runs in a row were discarded", async () => {
    let at = now;
    for (let run = 1; run <= MEMORY_DISCARD_RETRY_LIMIT; run++) {
      changeSourcesDuringNextProviderCall();
      at = new Date(+now + run * HOUR);
      expect(await processMemory("r1", generateMemory, config, at)).toBe("failed");
      expect(state.discardStreak).toBe(run);
    }
    expect(state.nextCheckAt).toEqual(new Date(+at + WEEK - SLACK));
    expect(provider).toHaveBeenCalledTimes(MEMORY_DISCARD_RETRY_LIMIT);
  });

  it("resets the discard streak after a successful publication", async () => {
    changeSourcesDuringNextProviderCall();
    expect(await processMemory("r1", generateMemory, config, now)).toBe("failed");
    expect(state.discardStreak).toBe(1);
    expect(await processMemory("r1", generateMemory, config, new Date(+now + DAY))).toBe("completed");
    expect(state.discardStreak).toBe(0);
  });
});
