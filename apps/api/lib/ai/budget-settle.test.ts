// A4 — closing a reservation: exact usage, interrupted stream, nothing generated
// and reconciliation share one row-locked, idempotent accounting. No database.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  budget: { id: "pilot", limitMicros: 50_000_000, heldMicros: 0, spentMicros: 0, endsAt: new Date("2026-11-01"), blockedAt: null, warnedAt: null } as Record<string, unknown>,
  generation: {} as Record<string, unknown>,
  updateGeneration: vi.fn(), updateBudget: vi.fn(), transaction: vi.fn(), opusStream: vi.fn(),
}));
vi.mock("@atelier/db", () => ({ prisma: { $transaction: h.transaction } }));
vi.mock("../logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@anthropic-ai/sdk", async importOriginal => ({
  ...(await importOriginal<typeof import("@anthropic-ai/sdk")>()),
  default: class { messages = { stream: h.opusStream }; },
}));
import { expireGeneration, releaseGeneration, settleGeneration, settleInterruptedGeneration, type Reservation } from "./budget";
import { modelRate, usageMicros } from "./budget-policy";
import { streamChat } from "./chat";
import { chatConfig } from "./config";
import { emptyUsage } from "./types";

const rate = modelRate("claude-opus-5-5");
const reservation: Reservation = { id: "gen-1", budgetId: "pilot", micros: 900_000, rate };
const tx = {
  $queryRaw: vi.fn(async () => [h.budget]),
  aiGeneration: { findUniqueOrThrow: vi.fn(async () => h.generation), update: h.updateGeneration },
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
