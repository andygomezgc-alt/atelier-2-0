import { describe, expect, it } from "vitest";
import { allowance, budgetErrorResponse, modelRate, pilotEnd, reservationMicros, textInputCeiling, usageMicros } from "./budget-policy";

const now = new Date("2026-09-10T12:00:00Z");
describe("pilot policy", () => {
  it("allows all 140 Daily generations together and rejects the next", () => {
    let quota = { dailyAt: [] as Date[], creativeAt: [] as Date[] };
    for (let i = 0; i < 140; i++) quota = allowance("daily", quota.dailyAt, quota.creativeAt, now);
    expect(quota.dailyAt).toHaveLength(140);
    expect(() => allowance("daily", quota.dailyAt, quota.creativeAt, now)).toThrow("ai_daily_weekly_limit");
  });
  it.each(["daily", "creative"] as const)("does not reset %s at midnight, on Monday or on a month boundary", task => {
    for (const [before, after] of [
      ["2026-09-09T23:59:00Z", "2026-09-10T00:00:00Z"],
      ["2026-09-06T23:59:00Z", "2026-09-07T00:00:00Z"],
      ["2026-08-31T23:59:00Z", "2026-09-01T00:00:00Z"],
    ]) {
      const daily = Array.from({ length: 140 }, () => new Date(before!));
      const creative = daily.slice(0, 8);
      expect(() => allowance(task, daily, creative, new Date(after!))).toThrow(task === "daily" ? "ai_daily_weekly_limit" : "ai_creative_limit");
    }
  });
  it("permits eight Creative responses together, independently of Daily", () => {
    const daily = Array.from({ length: 140 }, () => now);
    const dates = Array.from({ length: 7 }, () => new Date(+now - 1000));
    const value = allowance("creative", daily, dates, now);
    expect(value.creativeAt).toHaveLength(8); expect(value.dailyAt).toEqual(daily);
    expect(() => allowance("creative", value.dailyAt, value.creativeAt, now)).toThrow("ai_creative_limit");
    expect(allowance("daily", [], value.creativeAt, now).dailyAt).toHaveLength(1);
  });
  it.each(["daily", "creative"] as const)("recovers a %s slot exactly seven days after use, preserving newer uses", task => {
    const limit = task === "daily" ? 140 : 8;
    const dates = [...Array.from({ length: limit - 1 }, () => now), new Date("2026-09-03T12:00:01Z")];
    const daily = task === "daily" ? dates : [];
    const creative = task === "creative" ? dates : [];
    try { allowance(task, daily, creative, now); throw new Error("allowed"); }
    catch (error) { expect(error).toMatchObject({ code: task === "daily" ? "ai_daily_weekly_limit" : "ai_creative_limit", retryAfter: 1 }); }
    const value = allowance(task, daily, creative, new Date(+now + 1000));
    expect(value[task === "daily" ? "dailyAt" : "creativeAt"]).toHaveLength(limit);
    expect(() => allowance(task, value.dailyAt, value.creativeAt, new Date(+now + 1000))).toThrow();
  });
  it("reports a weekly error and waits for enough migrated uses to expire", async () => {
    const dates = [...Array.from({ length: 140 }, () => new Date("2026-09-03T12:00:02Z")), new Date("2026-09-03T12:00:01Z")];
    try { allowance("daily", dates, [], now); throw new Error("allowed"); }
    catch (error) {
      const response = budgetErrorResponse(error)!;
      expect(response.status).toBe(429);
      expect(response.headers.get("Retry-After")).toBe("2");
      expect(await response.json()).toMatchObject({ code: "ai_daily_weekly_limit" });
    }
  });
  it("prunes old dates from both modes without mutating the stored history", () => {
    const dates = [new Date("2026-09-03T12:00:00Z"), now, new Date("2026-08-01")];
    expect(allowance("daily", dates, dates, now)).toEqual({ dailyAt: [now, now], creativeAt: [now] });
    expect(dates).toHaveLength(3);
  });
  it("clamps the one-month pilot end to the last day and preserves the time", () => {
    expect(pilotEnd(new Date("2026-01-31T12:34:00Z")).toISOString()).toBe("2026-02-28T12:34:00.000Z");
    expect(pilotEnd(now).toISOString()).toBe("2026-10-10T12:00:00.000Z");
  });
});
describe("cost accounting", () => {
  it("separates Opus uncached, five-minute writes and reads", () => {
    expect(usageMicros(modelRate("claude-opus-5", now), { inputTokens: 6000, outputTokens: 6000, cachedTokens: 2000, cacheWriteTokens: 1000, reasoningTokens: 4000 })).toBe(215313);
  });
  it("does not count reasoning twice", () => {
    expect(usageMicros(modelRate("gemini-3.8-flash", now), { inputTokens: 4000, outputTokens: 1500, cachedTokens: 0, reasoningTokens: 1000 })).toBe(10782);
  });
  it("applies the announced Gemini tariff change automatically", () => {
    expect(modelRate("gemini-3.8-flash", new Date("2027-01-01"))).toMatchObject({ input: 1.5, output: 7.5 });
  });
  it("rejects unknown models and invalid usage instead of treating them as free", () => {
    expect(() => modelRate("new-model")).toThrow("ai_budget_unavailable");
    expect(() => usageMicros(modelRate("glm-5.3-flash"), { inputTokens: 1, outputTokens: NaN, cachedTokens: 0, reasoningTokens: 0 })).toThrow();
    expect(() => usageMicros(modelRate("glm-5.3-flash"), { inputTokens: 1, outputTokens: 1, cachedTokens: 2, reasoningTokens: 0 })).toThrow();
  });
  it("reserves worst-case cache writes and maximum billable output", () => {
    const value = reservationMicros("claude-opus-5", 10000, 16384, now);
    expect(value.micros).toBe(590125);
    expect(() => reservationMicros("claude-opus-5", Infinity, 1, now)).toThrow();
  });
  it("budgets text framing and multi-byte text without another AI call", () => {
    expect(textInputCeiling({ text: "🍋" })).toBeGreaterThan(textInputCeiling({ text: "x" }));
    expect(textInputCeiling("test")).toBeGreaterThan(8192);
  });
});
