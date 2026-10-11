import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiBudgetError } from "../ai/budget-policy";

const { db, loadEvidence, loadIngredientStats } = vi.hoisted(() => ({
  db: {
    culinaryMemory: { findUnique: vi.fn(), updateMany: vi.fn() },
    culinaryMemoryRun: { create: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
  loadEvidence: vi.fn(),
  loadIngredientStats: vi.fn(),
}));
vi.mock("@atelier/db", () => ({ prisma: db, Prisma: { DbNull: "DB_NULL" } }));
vi.mock("./service", () => ({ loadEvidence, loadIngredientStats, correctionsOf: (v: unknown) => v ?? [] }));

import { learnAfterImport, maintainMemoryRuns, memoryFailureFingerprint, processMemory } from "./worker";
import { evidenceHash } from "./evidence";
import { MEMORY_FAILURE_SUSPENSION_THRESHOLD, MEMORY_PROMPT_VERSION } from "./limits";

const DAY = 86_400_000;
const WEEK = 7 * DAY;
const SLACK = 2 * 60 * 60 * 1000;
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
  loadIngredientStats.mockResolvedValue([]);
});

describe("weekly memory worker", () => {
  it("does not reserve or call without provider, sources or changes", async () => {
    const generate = vi.fn();
    expect(await processMemory("r1", generate, null, now)).toBe("unconfigured");
    loadEvidence.mockResolvedValueOnce(evidence.slice(0, 1));
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

  it("does not call the provider again when memory is re-enabled within a week of the last attempt", async () => {
    // Encender la memoria borra retryAt y cambia la revisión; el intento semanal sigue mandando.
    const generate = vi.fn();
    const lastAttemptAt = new Date(+now - DAY);
    db.culinaryMemory.findUnique.mockResolvedValue(memory({ lastAttemptAt, cycleStartedAt: lastAttemptAt, dirtyRevision: 5, version: 3 }));
    expect(await processMemory("r1", generate, config, now)).toBe("skipped");
    expect(generate).not.toHaveBeenCalled();
    expect(db.culinaryMemoryRun.create).not.toHaveBeenCalled();
    expect(db.culinaryMemory.updateMany).toHaveBeenCalledWith({
      where: { restaurantId: "r1", version: 3, dirtyRevision: 5 },
      data: { nextCheckAt: new Date(+lastAttemptAt + WEEK - SLACK) },
    });
  });

  it("allows exactly one transient retry after 24h and records the real attempt time", async () => {
    const retryAt = new Date(+now - 1);
    const cycleStartedAt = new Date(+now - DAY);
    db.culinaryMemory.findUnique.mockResolvedValue(memory({ lastAttemptAt: cycleStartedAt, cycleStartedAt, retryAt }));
    expect(await processMemory("r1", successful(), config, now)).toBe("completed");
    expect(db.culinaryMemoryRun.create).toHaveBeenCalledWith({ data: expect.objectContaining({ isRetry: true, cycleStartedAt }) });
    const claim = db.culinaryMemory.updateMany.mock.calls.find(([arg]) => arg.data.lockToken)?.[0];
    expect(claim.data).toMatchObject({ lastAttemptAt: now, retryAt: null });
    expect(claim.data.nextCheckAt).toEqual(new Date(+now + WEEK - SLACK));
  });

  it("schedules one 24h retry only for an eligible transient failure", async () => {
    expect(await processMemory("r1", vi.fn().mockRejectedValue(new TypeError("fetch failed")), config, now)).toBe("failed");
    expect(db.culinaryMemoryRun.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: "running" }),
      data: expect.objectContaining({ errorCode: "memory_provider_transient" }),
    }));
    expect(db.culinaryMemory.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ lockToken: expect.any(String) }),
      data: expect.objectContaining({ retryAt: new Date(+now + DAY - SLACK), nextCheckAt: new Date(+now + DAY - SLACK) }),
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

  it("starts with the minimum of two eligible recipes", async () => {
    loadEvidence.mockResolvedValue(evidence.slice(0, 2));
    const generate = vi.fn().mockResolvedValue({ trends: [{ key: "techniques", text: "Tendencia", sources: [1, 2] }] });
    expect(await processMemory("r1", generate, config, now)).toBe("completed");
    expect(generate).toHaveBeenCalledOnce();
    const update = db.culinaryMemory.updateMany.mock.calls.find(([arg]) => "learned" in arg.data)![0];
    expect(update.data.learned[0].sources).toHaveLength(2);
  });

  it("does not retry invalid sources and never replaces prior content when every trend is invalid", async () => {
    const generate = vi.fn().mockResolvedValue({ trends: [{ key: "cuisine", text: "Tendencia", sources: [1, 99] }] });
    expect(await processMemory("r1", generate, config, now)).toBe("failed");
    expect(db.culinaryMemoryRun.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ errorCode: "memory_output_invalid" }) }));
    expect(db.culinaryMemory.updateMany.mock.calls.some(([arg]) => "learned" in arg.data)).toBe(false);
  });

  it("drops only the invalid trend and publishes the valid ones", async () => {
    const generate = vi.fn().mockResolvedValue({ trends: [
      { key: "cuisine", text: "Mal citada", sources: [1, 99] },
      { key: "flavours", text: "Repetida", sources: [2, 2] },
      { key: "techniques", text: "Buena", sources: [1, 2, 3] },
    ] });
    expect(await processMemory("r1", generate, config, now)).toBe("completed");
    const update = db.culinaryMemory.updateMany.mock.calls.find(([arg]) => "learned" in arg.data)![0];
    expect(update.data.learned).toEqual([{ key: "techniques", text: "Buena", sources: evidence.map(e => ({ id: e.id, hash: e.hash, version: 2 })) }]);
    expect(db.culinaryMemoryRun.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      status: "completed", publishedTrends: [{ key: "techniques", text: "Buena" }],
    }) }));
  });

  it("counts trends rejected by the provider schema, so a fully malformed response keeps the old memory", async () => {
    const generate = vi.fn().mockResolvedValue({ trends: [], rejected: 2 });
    expect(await processMemory("r1", generate, config, now)).toBe("failed");
    expect(db.culinaryMemoryRun.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ errorCode: "memory_output_invalid" }) }));
    expect(db.culinaryMemory.updateMany.mock.calls.some(([arg]) => "learned" in arg.data)).toBe(false);
  });

  it("publishes the valid trends even when the provider rejected others", async () => {
    const generate = vi.fn().mockResolvedValue({ trends: [{ key: "techniques", text: "Buena", sources: [1, 2] }], rejected: 1 });
    expect(await processMemory("r1", generate, config, now)).toBe("completed");
    const update = db.culinaryMemory.updateMany.mock.calls.find(([arg]) => "learned" in arg.data)![0];
    expect(update.data.learned).toHaveLength(1);
  });

  it("keeps a trend whose extra references point outside the evidence when two valid ones remain", async () => {
    const generate = vi.fn().mockResolvedValue({ trends: [{ key: "techniques", text: "Tendencia", sources: [1, 2, 99] }] });
    expect(await processMemory("r1", generate, config, now)).toBe("completed");
    const update = db.culinaryMemory.updateMany.mock.calls.find(([arg]) => "learned" in arg.data)![0];
    expect(update.data.learned[0].sources.map((s: { id: string }) => s.id)).toEqual(["1", "2"]);
  });

  it("publishes an empty list for an empty response and ignores invalid trends of excluded categories", async () => {
    expect(await processMemory("r1", vi.fn().mockResolvedValue({ trends: [] }), config, now)).toBe("completed");
    expect(db.culinaryMemory.updateMany.mock.calls.find(([arg]) => "learned" in arg.data)![0].data.learned).toEqual([]);

    db.culinaryMemory.updateMany.mockClear();
    db.culinaryMemory.findUnique.mockResolvedValue(memory({ excludedKeys: ["cuisine"] }));
    const generate = vi.fn().mockResolvedValue({ trends: [{ key: "cuisine", text: "Excluida", sources: [1] }] });
    expect(await processMemory("r1", generate, config, now)).toBe("completed");
    expect(db.culinaryMemory.updateMany.mock.calls.find(([arg]) => "learned" in arg.data)![0].data.learned).toEqual([]);
  });

  it("filters excluded, corrected and duplicate categories before filling the trend cap", async () => {
    db.culinaryMemory.findUnique.mockResolvedValue(memory({
      corrections: [{ key: "ingredients", text: "Corrección" }],
      excludedKeys: ["cuisine"],
    }));
    const generate = vi.fn().mockResolvedValue({ trends: [
      { key: "cuisine", text: "Excluida", sources: [1, 2] },
      { key: "ingredients", text: "Corregida", sources: [1, 2] },
      { key: "flavours", text: "Primera válida", sources: [1, 2] },
      { key: "flavours", text: "Duplicada", sources: [1, 2] },
      { key: "techniques", text: "Válida posterior", sources: [1, 2] },
    ] });
    expect(await processMemory("r1", generate, config, now)).toBe("completed");
    const update = db.culinaryMemory.updateMany.mock.calls.find(([arg]) => "learned" in arg.data)![0];
    expect(update.data.learned.map(({ key }: { key: string }) => key)).toEqual(["flavours", "techniques"]);
  });

  it("publishes at most four valid trends after filtering", async () => {
    const keys = ["cuisine", "ingredients", "techniques", "flavours", "textures", "presentation"];
    const generate = vi.fn().mockResolvedValue({ trends: keys.map(key => ({
      key, text: "Tendencia", sources: [1, 2, 3],
    })) });
    expect(await processMemory("r1", generate, config, now)).toBe("completed");
    const update = db.culinaryMemory.updateMany.mock.calls.find(([arg]) => "learned" in arg.data)![0];
    expect(update.data.learned.map(({ key }: { key: string }) => key)).toEqual(keys.slice(0, 4));
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

  it("loads current ingredient statistics after the final source reread and before the publication transaction", async () => {
    let generatorFinished = false;
    let finalSourcesRead = false;
    loadEvidence.mockImplementation(async () => {
      if (generatorFinished) finalSourcesRead = true;
      return evidence;
    });
    loadIngredientStats.mockImplementation(async () => finalSourcesRead
      ? [{ name: "ricciola", recipes: 8 }, { name: "azafrán", recipes: 6 }]
      : [{ name: "stale ingredient", recipes: 99 }]);
    const generate = vi.fn(async () => {
      generatorFinished = true;
      return { trends: [{ key: "techniques" as const, text: "Tendencia", sources: [1, 2] }] };
    });
    expect(await processMemory("r1", generate, config, now)).toBe("completed");
    expect(loadIngredientStats).toHaveBeenCalledTimes(1);
    expect(loadIngredientStats).toHaveBeenCalledWith("r1");
    const statsOrder = loadIngredientStats.mock.invocationCallOrder[0]!;
    expect(statsOrder).toBeGreaterThan(loadEvidence.mock.invocationCallOrder[1]!);
    expect(statsOrder).toBeGreaterThan(generate.mock.invocationCallOrder[0]!);
    const transactions = db.$transaction.mock.invocationCallOrder;
    expect(statsOrder).toBeLessThan(transactions[transactions.length - 1]!);
    const update = db.culinaryMemory.updateMany.mock.calls.find(([arg]) => "learned" in arg.data)![0];
    expect(update.data.preparedContext).toContain('"ingredientesFrecuentes":"ricciola 8, azafrán 6"');
    expect(update.data.preparedContext).toContain("ingredientesFrecuentes dice en cuántas recetas en prueba o aprobadas aparece cada ingrediente.");
    expect(update.data.preparedContext).toContain("Tendencia");
    expect(update.data.preparedContext).not.toContain("stale ingredient");
  });

  it("publishes ingredient-only prepared context when the generator returns no trends", async () => {
    loadIngredientStats.mockResolvedValue([{ name: "ricciola", recipes: 8 }]);
    expect(await processMemory("r1", vi.fn().mockResolvedValue({ trends: [] }), config, now)).toBe("completed");
    const update = db.culinaryMemory.updateMany.mock.calls.find(([arg]) => "learned" in arg.data)![0];
    expect(update.data.learned).toEqual([]);
    expect(update.data.preparedContext).toContain('"ingredientesFrecuentes":"ricciola 8"');
  });

  it("omits ingredient statistics and their explanation from publication when ingredients are excluded", async () => {
    db.culinaryMemory.findUnique.mockResolvedValue(memory({ excludedKeys: ["ingredients"] }));
    loadIngredientStats.mockResolvedValue([{ name: "ricciola", recipes: 8 }]);
    expect(await processMemory("r1", successful(), config, now)).toBe("completed");
    const update = db.culinaryMemory.updateMany.mock.calls.find(([arg]) => "learned" in arg.data)![0];
    expect(update.data.preparedContext).toContain("Tendencia");
    expect(update.data.preparedContext).not.toContain("ingredientesFrecuentes");
    expect(update.data.preparedContext).not.toContain("ricciola");
  });

  it("does not load ingredient statistics or publish when the final sources changed", async () => {
    loadEvidence.mockResolvedValueOnce(evidence).mockResolvedValueOnce(evidence.map(item => ({ ...item, hash: `changed-${item.hash}` })));
    expect(await processMemory("r1", successful(), config, now)).toBe("failed");
    expect(loadIngredientStats).not.toHaveBeenCalled();
    expect(db.culinaryMemory.updateMany.mock.calls.some(([arg]) => "learned" in arg.data)).toBe(false);
    expect(db.culinaryMemoryRun.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ errorCode: "memory_sources_changed" }),
    }));
  });

  it("passes the deadline signal to the provider", async () => {
    const controller = new AbortController();
    const generate = vi.fn().mockResolvedValue({ trends: [] });
    await processMemory("r1", generate, config, now, controller.signal);
    expect(generate.mock.calls[0]![0].signal).toBe(controller.signal);
  });
});

describe("learning right after an import", () => {
  const claimOf = () => db.culinaryMemory.updateMany.mock.calls.find(([arg]) => arg.data.lockToken)?.[0];

  it("skips the weekly window and reserves with only the lock condition, as a regular attempt", async () => {
    const lastAttemptAt = new Date(+now - DAY);
    db.culinaryMemory.findUnique.mockResolvedValue(memory({ lastAttemptAt, cycleStartedAt: lastAttemptAt }));
    expect(await processMemory("r1", successful(), config, now, undefined, { afterImport: true })).toBe("completed");
    const claim = claimOf();
    expect(claim.where).toEqual({
      restaurantId: "r1", enabled: true, version: 1, dirtyRevision: 2,
      AND: [{}, { OR: [{ lockExpiresAt: null }, { lockExpiresAt: { lte: now } }] }],
    });
    expect(claim.data).toMatchObject({ lastAttemptAt: now, cycleStartedAt: now, retryAt: null, nextCheckAt: new Date(+now + WEEK - SLACK) });
    expect(db.culinaryMemoryRun.create).toHaveBeenCalledWith({ data: expect.objectContaining({ isRetry: false, cycleStartedAt: now }) });
  });

  it("skips a pending retry wait and counts as a regular attempt, not the retry", async () => {
    const cycleStartedAt = new Date(+now - DAY);
    db.culinaryMemory.findUnique.mockResolvedValue(memory({ lastAttemptAt: cycleStartedAt, cycleStartedAt, retryAt: new Date(+now + DAY) }));
    expect(await processMemory("r1", successful(), config, now, undefined, { afterImport: true })).toBe("completed");
    expect(db.culinaryMemoryRun.create).toHaveBeenCalledWith({ data: expect.objectContaining({ isRetry: false, cycleStartedAt: now }) });
    expect(claimOf().data).toMatchObject({ retryAt: null, cycleStartedAt: now, nextCheckAt: new Date(+now + WEEK - SLACK) });
  });

  it("does not treat a due retry as the retry either", async () => {
    const cycleStartedAt = new Date(+now - 2 * DAY);
    db.culinaryMemory.findUnique.mockResolvedValue(memory({ lastAttemptAt: cycleStartedAt, cycleStartedAt, retryAt: new Date(+now - 1) }));
    expect(await processMemory("r1", successful(), config, now, undefined, { afterImport: true })).toBe("completed");
    expect(db.culinaryMemoryRun.create).toHaveBeenCalledWith({ data: expect.objectContaining({ isRetry: false, cycleStartedAt: now }) });
  });

  it("returns locked with a live lock, while the regular mode keeps returning skipped", async () => {
    const generate = vi.fn();
    db.culinaryMemory.findUnique.mockResolvedValue(memory({ lockExpiresAt: new Date(+now + 60_000) }));
    expect(await processMemory("r1", generate, config, now, undefined, { afterImport: true })).toBe("locked");
    expect(await processMemory("r1", generate, config, now)).toBe("skipped");
    expect(generate).not.toHaveBeenCalled();
    expect(db.culinaryMemoryRun.create).not.toHaveBeenCalled();
  });

  it("keeps every other gate: memory off, no changes and fewer than two recipes", async () => {
    const generate = vi.fn();
    db.culinaryMemory.findUnique.mockResolvedValueOnce(memory({ enabled: false }));
    expect(await processMemory("r1", generate, config, now, undefined, { afterImport: true })).toBe("skipped");
    db.culinaryMemory.findUnique.mockResolvedValueOnce(memory({ checkedRevision: 2 }));
    expect(await processMemory("r1", generate, config, now, undefined, { afterImport: true })).toBe("unchanged");
    loadEvidence.mockResolvedValueOnce(evidence.slice(0, 1));
    expect(await processMemory("r1", generate, config, now, undefined, { afterImport: true })).toBe("unchanged");
    expect(generate).not.toHaveBeenCalled();
  });
});

describe("learnAfterImport", () => {
  const locked = () => memory({ lockExpiresAt: new Date(Date.now() + 60_000) });

  it("retries while the memory is locked or busy and returns the first other result", async () => {
    db.culinaryMemory.findUnique.mockResolvedValueOnce(locked());
    db.culinaryMemory.updateMany.mockResolvedValueOnce({ count: 0 });
    const generate = successful();
    expect(await learnAfterImport("r1", { generator: generate, config, pollMs: 1 })).toBe("completed");
    expect(db.culinaryMemory.findUnique).toHaveBeenCalledTimes(3);
    expect(generate).toHaveBeenCalledOnce();
    expect(db.culinaryMemoryRun.create).toHaveBeenCalledOnce();
    expect(db.culinaryMemoryRun.create).toHaveBeenCalledWith({ data: expect.objectContaining({ isRetry: false }) });
  });

  it.each<[string, () => void]>([
    ["unchanged", () => db.culinaryMemory.findUnique.mockResolvedValueOnce(memory({ checkedRevision: 2 }))],
    ["skipped", () => db.culinaryMemory.findUnique.mockResolvedValueOnce(memory({ enabled: false }))],
    ["failed", () => loadEvidence.mockResolvedValueOnce(evidence).mockResolvedValueOnce([])],
  ])("stops at once on %s", async (result, arrange) => {
    arrange();
    expect(await learnAfterImport("r1", { generator: successful(), config, pollMs: 1 })).toBe(result);
    expect(db.culinaryMemory.findUnique).toHaveBeenCalledOnce();
  });

  it("keeps the failure suppression: an import does not pay again for the same failed input", async () => {
    const fingerprint = memoryFailureFingerprint({ inputHash: evidenceHash(evidence, null, [], []), model: config.model, promptVersion: MEMORY_PROMPT_VERSION });
    const suppressed = { lastFailedInputHash: fingerprint, failureCount: MEMORY_FAILURE_SUSPENSION_THRESHOLD, lastFailedAt: new Date(Date.now() - DAY) };
    db.culinaryMemory.findUnique.mockResolvedValue(memory(suppressed));
    const generate = successful();
    expect(await learnAfterImport("r1", { generator: generate, config, pollMs: 1 })).toBe("suppressed");
    expect(generate).not.toHaveBeenCalled();
    expect(db.culinaryMemoryRun.create).not.toHaveBeenCalled();
    // The imported recipe changes the evidence, and with it the fingerprint: learning goes ahead.
    loadEvidence.mockResolvedValue([...evidence, { ...evidence[0]!, id: "4", hash: "h4", duplicateKey: "d4" }]);
    expect(await learnAfterImport("r1", { generator: generate, config, pollMs: 1 })).toBe("completed");
    expect(generate).toHaveBeenCalledOnce();
  });

  it("stops waiting when the signal aborts", async () => {
    const controller = new AbortController();
    db.culinaryMemory.findUnique.mockImplementation(async () => { controller.abort(new Error("deadline")); return locked(); });
    await expect(learnAfterImport("r1", { generator: vi.fn(), config, signal: controller.signal, pollMs: 60_000 })).rejects.toThrow("deadline");
    expect(db.culinaryMemory.findUnique).toHaveBeenCalledOnce();
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
      data: expect.objectContaining({ lockToken: null, retryAt: new Date(+regularAt + DAY - SLACK), nextCheckAt: new Date(+regularAt + DAY - SLACK) }),
    }));
    expect(db.culinaryMemory.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { restaurantId: "r2", lockToken: "retry" },
      data: expect.objectContaining({ lockToken: null, retryAt: null, nextCheckAt: new Date(+regularAt + WEEK - SLACK) }),
    }));
    expect(db.culinaryMemory.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { restaurantId: "r3", lockToken: "paid" },
      data: expect.objectContaining({ lockToken: null, retryAt: null, nextCheckAt: new Date(+regularAt + WEEK - SLACK) }),
    }));
    expect(db.culinaryMemoryRun.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "paid", status: "running" }, data: expect.objectContaining({ errorCode: "memory_worker_interrupted_after_response" }),
    }));
  });
});
