import type { AiTask } from "./config";
import type { AiUsage } from "./types";

// This is a pilot spending allowance, not an automatically renewed subscription.
export const PILOT_BUDGET_MICROS = 50_000_000;
export const DAILY_CHAT_WEEKLY_LIMIT = 20 * 7;
export const CREATIVE_CHAT_LIMIT = 8;
export const WEEK_MS = 7 * 86_400_000;
export const OWNER_EMAIL = "andygomezgc@gmail.com";

export type BudgetCode = "ai_budget_exhausted" | "ai_budget_expired" | "ai_budget_unavailable" | "ai_daily_weekly_limit" | "ai_creative_limit";
export class AiBudgetError extends Error {
  constructor(public code: BudgetCode, public retryAfter = 60) { super(code); }
}
export function budgetErrorResponse(error: unknown): Response | undefined {
  if (!(error instanceof AiBudgetError)) return;
  return Response.json({ error: error.code, code: error.code }, {
    status: error.code === "ai_budget_unavailable" ? 503 : 429,
    headers: { "Retry-After": String(error.retryAfter) },
  });
}

// Conservative accounting: USD 1 consumes EUR 1.25 of the allowance. This
// includes a cushion for FX/tax/fees; it is not a claim about an actual invoice.
const EUR_ALLOWANCE_PER_USD = 1.25;
export type Rate = { input: number; output: number; cached: number; cacheWrite: number };
export function modelRate(model: string, now = new Date()): Rate {
  // Opus 5.5 lee la caché a 0,05× la entrada; los demás modelos a 0,1×.
  if (model === "claude-opus-5-5") return { input: 4, output: 20, cached: .2, cacheWrite: 5 };
  if (model === "claude-opus-5") return { input: 5, output: 25, cached: .5, cacheWrite: 6.25 };
  if (model === "gemini-3.8-flash") {
    const factor = now < new Date("2027-01-01T00:00:00Z") ? 1 : 2;
    return { input: .75 * factor, output: 3.75 * factor, cached: .075 * factor, cacheWrite: .75 * factor };
  }
  if (model === "glm-5.3-flash") return { input: .15, output: .5, cached: .03, cacheWrite: .15 };
  // Changing a model requires reviewing its tariff, never silently charging $0.
  throw new AiBudgetError("ai_budget_unavailable");
}
export function usageMicros(rate: Rate, usage: AiUsage): number {
  const { inputTokens, outputTokens, cachedTokens } = usage;
  const cacheWrite = usage.cacheWriteTokens ?? 0;
  if ([inputTokens, outputTokens, cachedTokens, cacheWrite].some(n => !Number.isSafeInteger(n) || n < 0) || cachedTokens + cacheWrite > inputTokens)
    throw new AiBudgetError("ai_budget_unavailable");
  return Math.ceil(EUR_ALLOWANCE_PER_USD * (
    (inputTokens - cachedTokens - cacheWrite) * rate.input + cachedTokens * rate.cached + cacheWrite * rate.cacheWrite + outputTokens * rate.output
  )); // USD/MTok × tokens equals micro-USD; reasoning is already in output.
}
export function reservationMicros(model: string, inputCeiling: number, outputCeiling: number, now = new Date()) {
  if (![inputCeiling, outputCeiling].every(n => Number.isSafeInteger(n) && n > 0 && n <= 2_097_152)) throw new AiBudgetError("ai_budget_unavailable");
  const rate = modelRate(model, now);
  return { rate, micros: Math.ceil(EUR_ALLOWANCE_PER_USD * (inputCeiling * Math.max(rate.input, rate.cacheWrite) + outputCeiling * rate.output)) };
}
/** Text-only requests: reserve far above ordinary tokenization, including framing. */
export function textInputCeiling(payload: unknown): number {
  return Buffer.byteLength(JSON.stringify(payload), "utf8") * 2 + 8192;
}
export function pilotEnd(start: Date): Date {
  const end = new Date(start);
  const day = end.getUTCDate();
  end.setUTCDate(1); end.setUTCMonth(end.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  end.setUTCDate(Math.min(day, lastDay));
  return end;
}
export function allowance(task: AiTask, dailyAt: Date[], creativeAt: Date[], now: Date) {
  const recent = (dates: Date[]) => dates.filter(d => +d > +now - WEEK_MS).sort((a, b) => +a - +b);
  const daily = recent(dailyAt);
  const creative = recent(creativeAt);
  // Also handle a migrated history above the new limit: enough slots must
  // expire before another generation fits, not just the oldest one.
  const retryAfter = (dates: Date[], limit: number) => Math.max(1, Math.ceil((+dates[dates.length - limit]! + WEEK_MS - +now) / 1000));
  if (task === "daily" && daily.length >= DAILY_CHAT_WEEKLY_LIMIT)
    throw new AiBudgetError("ai_daily_weekly_limit", retryAfter(daily, DAILY_CHAT_WEEKLY_LIMIT));
  if (task === "creative" && creative.length >= CREATIVE_CHAT_LIMIT)
    throw new AiBudgetError("ai_creative_limit", retryAfter(creative, CREATIVE_CHAT_LIMIT));
  return { dailyAt: task === "daily" ? [...daily, now] : daily, creativeAt: task === "creative" ? [...creative, now] : creative };
}
