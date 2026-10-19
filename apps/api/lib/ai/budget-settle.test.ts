// A4 — closing a reservation: exact usage, interrupted stream, nothing generated
// and reconciliation share one row-locked, idempotent accounting. No database.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  // A period far from ending: closing never renews it in these tests unless they set the clock.
  budget: { id: "pilot", limitMicros: 50_000_000, heldMicros: 0, spentMicros: 0, startsAt: new Date("2099-12-01"), endsAt: new Date("2100-01-01"), blockedAt: null, warnedAt: null } as Record<string, unknown>,
  generation: {} as Record<string, unknown>,
  updateGeneration: vi.fn(), updateBudget: vi.fn(), transaction: vi.fn(), opusStream: vi.fn(),
}));
vi.mock("@atelier/db", () => ({ prisma: { $transaction: h.transaction } }));
vi.mock("../logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@anthropic-ai/sdk", async importOriginal => ({
  ...(await importOriginal<typeof import("@anthropic-ai/sdk")>()),
  default: class { messages = { stream: h.opusStream }; },
}));
import { expireGeneration, releaseGeneration, reserveGeneration, settleGeneration, settleInterruptedGeneration, type Reservation } from "./budget";
import { logger } from "../logger";
import { modelRate, usageMicros } from "./budget-policy";
import { streamChat } from "./chat";
import { chatConfig } from "./config";
import { emptyUsage } from "./types";

const rate = modelRate("claude-opus-5-5");
const reservation: Reservation = { id: "gen-1", budgetId: "pilot", micros: 900_000, rate };
const tx = {
  $queryRaw: vi.fn(async () => [h.budget]),
  $executeRaw: vi.fn(),
  aiGeneration: { findUniqueOrThrow: vi.fn(async () => h.generation), update: h.updateGeneration, create: vi.fn() },
  aiBudget: { update: h.updateBudget },
};
beforeEach(() => {
  vi.clearAllMocks();
  h.opusStream.mockReset();
  h.generation = { id: "gen-1", budgetId: "pilot", status: "reserved", reservedMicros: 900_000, inputCeiling: 40_000, outputCeiling: 16_384 };
  h.transaction.mockImplementation(async (work: (client: typeof tx) => unknown) => work(tx));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const generationData = () => h.updateGeneration.mock.calls[0]![0].data;
const budgetData = () => h.updateBudget.mock.calls[0]![0].data;

describe("closing a chat reservation (A4)", () => {
  it("keeps the whole hold when nothing at all is known", async () => {
    await settleGeneration(reservation);
    expect(h.transaction).not.toHaveBeenCalled();
  });

  it("settles exact final usage as before", async () => {
    const usage = { inputTokens: 1000, outputTokens: 500, cachedTokens: 200, reasoningTokens: 0 };
    await settleGeneration(reservation, usage);
    expect(generationData()).toMatchObject({ status: "settled", chargedMicros: usageMicros(rate, usage), inputTokens: 1000, outputTokens: 500 });
    expect(budgetData()).toMatchObject({ heldMicros: { decrement: 900_000 }, spentMicros: { increment: usageMicros(rate, usage) } });
  });

  it("releases the whole hold, auditable, when the provider generated nothing", async () => {
    await releaseGeneration(reservation);
    expect(generationData()).toMatchObject({ status: "released", chargedMicros: 0, finishedAt: expect.any(Date) });
    expect(budgetData()).toMatchObject({ heldMicros: { decrement: 900_000 }, spentMicros: { increment: 0 } });
  });

  it("charges an interrupted stream its exact input plus the full output ceiling", async () => {
    const known = { inputTokens: 3000, outputTokens: 7, cachedTokens: 1000, cacheWriteTokens: 500, reasoningTokens: 0 };
    await settleInterruptedGeneration(reservation, known);
    const charged = usageMicros(rate, { ...known, outputTokens: 16_384 });
    expect(charged).toBeLessThan(900_000);
    expect(generationData()).toMatchObject({ status: "interrupted", chargedMicros: charged, inputTokens: 3000, outputTokens: 16_384, cachedTokens: 1000, cacheWriteTokens: 500, finishedAt: expect.any(Date) });
    expect(budgetData()).toMatchObject({ heldMicros: { decrement: 900_000 }, spentMicros: { increment: charged } });
    expect(budgetData().blockedAt).toBeUndefined();
  });

  it("expires a stale hold with the given charge, never above the reservation", async () => {
    expect(await expireGeneration("pilot", "gen-1", 120_000)).toBe(true);
    expect(generationData()).toMatchObject({ status: "expired", chargedMicros: 120_000, finishedAt: expect.any(Date) });
    expect(budgetData()).toMatchObject({ heldMicros: { decrement: 900_000 }, spentMicros: { increment: 120_000 } });
    vi.clearAllMocks();
    h.transaction.mockImplementation(async (work: (client: typeof tx) => unknown) => work(tx));
    await expireGeneration("pilot", "gen-1", 5_000_000);
    expect(generationData().chargedMicros).toBe(900_000);
  });

  it.each([
    ["release", () => releaseGeneration(reservation)],
    ["interrupted", () => settleInterruptedGeneration(reservation, { inputTokens: 10, outputTokens: 0, cachedTokens: 0, reasoningTokens: 0 })],
    ["expiry", () => expireGeneration("pilot", "gen-1", 1)],
  ])("is idempotent on status for %s: an already closed generation is left alone", async (_label, close) => {
    h.generation = { ...h.generation, status: "settled" };
    await close();
    expect(h.updateGeneration).not.toHaveBeenCalled();
    expect(h.updateBudget).not.toHaveBeenCalled();
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1); // Still under the budget row lock.
  });

  it("reports an expiry that found the generation already closed", async () => {
    h.generation = { ...h.generation, status: "settled" };
    expect(await expireGeneration("pilot", "gen-1", 1)).toBe(false);
  });

  it("keeps the hold when the interrupted usage is invalid", async () => {
    await settleInterruptedGeneration(reservation, { inputTokens: 10, outputTokens: 0, cachedTokens: 20, reasoningTokens: 0 });
    expect(h.updateGeneration).not.toHaveBeenCalled();
    expect(h.updateBudget).not.toHaveBeenCalled();
  });
});

describe("A6b managed uncertainty charges both ceilings (real adapter and budget)", () => {
  it.each(["daily", "creative"] as const)("%s closes a dispatched failure with no usage at the full output ceiling", async model => {
    vi.stubEnv("GEMINI_API_KEY", "test-gemini"); vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic");
    const config = chatConfig(model);
    const inputCeiling = 40_000;
    // Read the output ceiling from the locked generation row, not from caller usage.
    h.generation = { ...h.generation, inputCeiling, outputCeiling: config.maxTokens };
    const preparedReservation = { ...reservation, rate: modelRate(config.model) };
    const failure = new TypeError("connection failed before any usage arrived");
    const fetcher = vi.fn().mockRejectedValue(failure); vi.stubGlobal("fetch", fetcher);
    h.opusStream.mockReturnValue({
      async *[Symbol.asyncIterator]() { throw failure; },
      finalMessage: vi.fn(),
    });
    const generate = async () => {
      for await (const _event of streamChat({
        model, signal: new AbortController().signal, reservation: preparedReservation,
        system: [{ type: "text", text: "Kitchen context" }],
        messages: [{ role: "user", content: "Recipe" }],
        deadlineAt: Date.now() + 60_000, inputCeiling,
      })) { /* This provider fails before yielding any usage or text. */ }
    };

    await expect(generate()).rejects.toMatchObject({ code: "ai_provider_failed", cause: failure });

    expect(model === "creative" ? h.opusStream : fetcher).toHaveBeenCalledTimes(1);
    const fullUsage = { ...emptyUsage(), inputTokens: inputCeiling, outputTokens: config.maxTokens };
    const charged = usageMicros(preparedReservation.rate, fullUsage);
    expect(charged).toBeGreaterThan(usageMicros(preparedReservation.rate, { ...fullUsage, outputTokens: 0 }));
    // No settlement mock: these are writes produced by budget.ts against mocked Prisma.
    expect(h.transaction).toHaveBeenCalledTimes(1); expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(h.updateGeneration).toHaveBeenCalledTimes(1); expect(h.updateBudget).toHaveBeenCalledTimes(1);
    expect(generationData()).toMatchObject({
      status: "interrupted", inputTokens: inputCeiling, outputTokens: config.maxTokens,
      cachedTokens: 0, cacheWriteTokens: 0, chargedMicros: charged, finishedAt: expect.any(Date),
    });
    expect(budgetData()).toMatchObject({
      heldMicros: { decrement: preparedReservation.micros }, spentMicros: { increment: charged },
    });
    expect(budgetData().blockedAt).toBeUndefined();
  });
});

describe("monthly renewal of the shared pilot budget", () => {
  const config = { task: "extraction" as const, model: "claude-opus-5-5", maxTokens: 1000 };
  const endsAt = new Date("2026-11-18T22:59:00Z");
  beforeEach(() => {
    h.budget = { id: "pilot", limitMicros: 187_500_000, heldMicros: 2_000_000, spentMicros: 187_000_000, startsAt: new Date("2026-10-18T22:59:00Z"), endsAt, blockedAt: null, warnedAt: new Date("2026-11-10") };
  });
  afterEach(() => { vi.useRealTimers(); });
  const renewal = () => h.updateBudget.mock.calls.find(([arg]) => "startsAt" in arg.data)?.[0];

  it("renews an ended period under the row lock instead of expiring, keeping holds and the row's limit", async () => {
    const now = new Date("2026-11-19T08:00:00Z");
    const reserved = await reserveGeneration(config, 1000, undefined, now);
    expect(renewal()).toEqual({ where: { id: "pilot" }, data: { startsAt: endsAt, endsAt: new Date("2026-12-18T22:59:00Z"), spentMicros: 0, warnedAt: null } });
    expect(h.updateBudget).toHaveBeenLastCalledWith({ where: { id: "pilot" }, data: { heldMicros: { increment: reserved.micros } } });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith("ai_pilot_budget_rolled", { budgetId: "pilot", startsAt: endsAt.toISOString(), endsAt: "2026-12-18T22:59:00.000Z" });
  });

  it("skips months without traffic", async () => {
    await reserveGeneration(config, 1000, undefined, new Date("2027-02-01T00:00:00Z"));
    expect(renewal()?.data).toMatchObject({ startsAt: new Date("2027-01-18T22:59:00Z"), endsAt: new Date("2027-02-18T22:59:00Z") });
  });

  it("does not renew a period that has not ended", async () => {
    await expect(reserveGeneration(config, 1000, undefined, new Date(+endsAt - 1))).rejects.toMatchObject({ code: "ai_budget_exhausted" });
    expect(renewal()).toBeUndefined();
    expect(logger.info).not.toHaveBeenCalled();
  });

  it("renews an ended period before settling into it, so a late settlement is not wiped by the next reservation", async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-19T08:00:00Z"));
    const usage = { inputTokens: 1000, outputTokens: 500, cachedTokens: 0, reasoningTokens: 0 };
    await settleGeneration(reservation, usage);
    expect(h.updateBudget).toHaveBeenCalledTimes(1);
    expect(budgetData()).toEqual({
      startsAt: endsAt, endsAt: new Date("2026-12-18T22:59:00Z"),
      heldMicros: { decrement: 900_000 }, spentMicros: usageMicros(rate, usage), warnedAt: null,
    });
    expect(logger.info).toHaveBeenCalledWith("ai_pilot_budget_rolled", { budgetId: "pilot", startsAt: endsAt.toISOString(), endsAt: "2026-12-18T22:59:00.000Z" });
  });

  it("warns again when a late settlement alone crosses 75% of the renewed period", async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-19T08:00:00Z"));
    h.budget = { ...h.budget, limitMicros: 1_000_000 }; // The previous period had already warned.
    await expireGeneration("pilot", "gen-1", 800_000);
    expect(budgetData()).toMatchObject({ startsAt: endsAt, spentMicros: 800_000, warnedAt: expect.any(Date) });
    expect(logger.warn).toHaveBeenCalledWith("ai_pilot_budget_75_percent", { budgetId: "pilot" });
  });

  it("leaves an ended period alone when the generation was already closed", async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-19T08:00:00Z"));
    h.generation = { ...h.generation, status: "settled" };
    await releaseGeneration(reservation);
    expect(h.updateBudget).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
  });

  it("does not renew a blocked budget when settling", async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-19T08:00:00Z"));
    h.budget = { ...h.budget, blockedAt: new Date("2026-11-01") };
    await releaseGeneration(reservation);
    expect(budgetData()).toEqual({ heldMicros: { decrement: 900_000 }, spentMicros: { increment: 0 } });
  });

  it("does not renew a blocked budget", async () => {
    h.budget = { ...h.budget, blockedAt: new Date("2026-11-01") };
    await expect(reserveGeneration(config, 1000, undefined, new Date("2026-11-19T08:00:00Z"))).rejects.toMatchObject({ code: "ai_budget_unavailable" });
    expect(h.updateBudget).not.toHaveBeenCalled();
  });
});
