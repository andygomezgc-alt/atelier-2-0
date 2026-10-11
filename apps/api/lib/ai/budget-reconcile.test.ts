import { describe, expect, it } from "vitest";
import { expiryCharge, parseReconcileArgs, planExpiries, settledHistoryWhere, staleHoldsWhere, summarizeHolds } from "./budget-reconcile";

const now = new Date("2026-10-06T12:00:00Z");
describe("reconciling stale AI budget holds (A4)", () => {
  it("is a dry run over holds older than 30 minutes by default", () => {
    expect(parseReconcileArgs([])).toEqual({ apply: false, olderThanMinutes: 30 });
    expect(parseReconcileArgs(["--apply", "--older-than-minutes=90"])).toEqual({ apply: true, olderThanMinutes: 90 });
    expect(parseReconcileArgs(["--older-than-minutes", "45"])).toEqual({ apply: false, olderThanMinutes: 45 });
  });

  it.each([["--older-than-minutes=0"], ["--older-than-minutes=abc"], ["--older-than-minutes"], ["--force"]])("rejects %s", arg => {
    expect(() => parseReconcileArgs([arg])).toThrow();
  });

  it("selects only reserved generations created before the threshold", () => {
    expect(staleHoldsWhere(now, 30)).toEqual({ status: "reserved", createdAt: { lt: new Date("2026-10-06T11:30:00Z") } });
  });

  it("reads 30 days of settled history for the same model", () => {
    expect(settledHistoryWhere("claude-opus-5-5", now)).toEqual({
      model: "claude-opus-5-5", status: "settled", chargedMicros: { not: null }, finishedAt: { gte: new Date("2026-09-06T12:00:00Z") },
    });
  });

  it("charges the highest recent settled cost of the model, capped by the reservation", () => {
    expect(expiryCharge(900_000, 61_000)).toBe(61_000);
    expect(expiryCharge(900_000, 2_000_000)).toBe(900_000);
    expect(expiryCharge(900_000, 0)).toBe(0);
  });

  it("charges the whole reservation when the model has no history", () => {
    expect(expiryCharge(900_000, null)).toBe(900_000);
    expect(expiryCharge(900_000, undefined)).toBe(900_000);
  });

  it("plans each expiry with its own model history and totals the held micros", () => {
    const rows = [
      { id: "a", budgetId: "pilot", model: "claude-opus-5-5", reservedMicros: 900_000 },
      { id: "b", budgetId: "pilot", model: "gemini-3.8-flash", reservedMicros: 50_000 },
      { id: "c", budgetId: "pilot", model: "claude-opus-5-5", reservedMicros: 40_000 },
    ];
    expect(planExpiries(rows, new Map([["claude-opus-5-5", 61_000]]))).toEqual([
      { id: "a", budgetId: "pilot", model: "claude-opus-5-5", reservedMicros: 900_000, chargeMicros: 61_000 },
      { id: "b", budgetId: "pilot", model: "gemini-3.8-flash", reservedMicros: 50_000, chargeMicros: 50_000 },
      { id: "c", budgetId: "pilot", model: "claude-opus-5-5", reservedMicros: 40_000, chargeMicros: 40_000 },
    ]);
    expect(summarizeHolds(rows)).toEqual({ count: 3, heldMicros: 990_000 });
    expect(summarizeHolds([])).toEqual({ count: 0, heldMicros: 0 });
  });
});
