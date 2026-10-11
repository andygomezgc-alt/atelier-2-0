import { randomUUID } from "node:crypto";
import { prisma } from "@atelier/db";
import { logger } from "../logger";
import { AiBudgetError, OWNER_EMAIL, PILOT_BUDGET_MICROS, allowance, modelRate, pilotEnd, reservationMicros, usageMicros } from "./budget-policy";
import type { AiTask } from "./config";
import type { AiUsage } from "./types";

export async function isAiOwner(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  return user?.email.trim().toLowerCase() === OWNER_EMAIL;
}

type BudgetRow = { id: string; limitMicros: number; heldMicros: number; spentMicros: number; endsAt: Date; blockedAt: Date | null; warnedAt: Date | null };
export type Reservation = { id: string; budgetId: string; micros: number; rate: ReturnType<typeof modelRate> };
/** Fail closed, across every server instance and every provider, before generation. */
export async function reserveGeneration(config: { task: AiTask; model: string; maxTokens: number }, inputCeiling: number, userId?: string, now = new Date(), budgetId = "pilot"): Promise<Reservation> {
  const { rate, micros } = reservationMicros(config.model, inputCeiling, config.maxTokens, now);
  try {
    return await prisma.$transaction(async tx => {
      await tx.$executeRaw`INSERT INTO "AiBudget" ("id", "limitMicros", "startsAt", "endsAt") VALUES (${budgetId}, ${PILOT_BUDGET_MICROS}, ${now}, ${pilotEnd(now)}) ON CONFLICT ("id") DO NOTHING`;
      const [budget] = await tx.$queryRaw<BudgetRow[]>`SELECT * FROM "AiBudget" WHERE "id" = ${budgetId} FOR UPDATE`;
      if (!budget || budget.blockedAt) throw new AiBudgetError("ai_budget_unavailable");
      if (now >= budget.endsAt) throw new AiBudgetError("ai_budget_expired", 86400);
      if (budget.spentMicros + budget.heldMicros + micros > budget.limitMicros) throw new AiBudgetError("ai_budget_exhausted", 60);
      if (config.task === "daily" || config.task === "creative") {
        // Provider adapters may also be used by trusted diagnostic scripts. HTTP
        // chat paths always supply the authenticated ID, never a body/email flag.
        if (userId) {
          const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
          if (user.email.trim().toLowerCase() !== OWNER_EMAIL) {
            await tx.aiChatQuota.upsert({ where: { userId }, create: { userId, day: "" }, update: {} });
            const [quota] = await tx.$queryRaw<{ dailyAt: Date[]; creativeAt: Date[] }[]>`SELECT * FROM "AiChatQuota" WHERE "userId" = ${userId} FOR UPDATE`;
            if (!quota) throw new Error("missing_quota");
            const data = allowance(config.task, quota.dailyAt, quota.creativeAt, now);
            await tx.aiChatQuota.update({ where: { userId }, data });
          }
        }
      }
      const id = randomUUID();
      await tx.aiGeneration.create({ data: { id, budgetId, userId, task: config.task, model: config.model, reservedMicros: micros, inputCeiling, outputCeiling: config.maxTokens, createdAt: now } });
      await tx.aiBudget.update({ where: { id: budgetId }, data: { heldMicros: { increment: micros } } });
      return { id, budgetId, micros, rate };
    }, { maxWait: 10_000, timeout: 15_000 });
  } catch (error) {
    if (error instanceof AiBudgetError) throw error;
    logger.error("ai_budget_reservation_failed", { error: "database_unavailable" });
    throw new AiBudgetError("ai_budget_unavailable");
  }
}

type GenerationRow = { budgetId: string; status: string; reservedMicros: number; inputCeiling: number; outputCeiling: number };
/** How a reserved generation closes: `micros` becomes spending; `usage` is recorded when known. */
type Closing = { status: "settled" | "interrupted" | "released" | "expired"; micros: number; usage?: AiUsage };

/**
 * One accounting for every way a generation ends, under the budget row lock:
 * the whole hold goes away and `micros` is spent. Idempotent on status, so a
 * late settlement never double-counts. Returns false if it was already closed.
 */
async function closeGeneration(budgetId: string, id: string, reservedMicros: number | undefined, close: (generation: GenerationRow) => Closing): Promise<boolean> {
  const result = await prisma.$transaction(async tx => {
    const [budget] = await tx.$queryRaw<BudgetRow[]>`SELECT * FROM "AiBudget" WHERE "id" = ${budgetId} FOR UPDATE`;
    if (!budget) throw new Error("missing_budget");
    const generation = await tx.aiGeneration.findUniqueOrThrow({ where: { id } });
    if (generation.status !== "reserved") return { closed: false, warn: false };
    if (generation.budgetId !== budgetId || (reservedMicros !== undefined && generation.reservedMicros !== reservedMicros)) throw new Error("invalid_reservation");
    const { status, micros, usage } = close(generation);
    const exceeded = micros > generation.reservedMicros || (!!usage && (usage.inputTokens > generation.inputCeiling || usage.outputTokens > generation.outputCeiling));
    const total = budget.spentMicros + micros;
    const warn = !budget.warnedAt && total >= budget.limitMicros * .75;
    const tokens = usage ? { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, cachedTokens: usage.cachedTokens, cacheWriteTokens: usage.cacheWriteTokens ?? 0 } : {};
    await tx.aiGeneration.update({ where: { id }, data: { status, chargedMicros: micros, ...tokens, finishedAt: new Date() } });
    await tx.aiBudget.update({ where: { id: budgetId }, data: {
      heldMicros: { decrement: generation.reservedMicros }, spentMicros: { increment: micros },
      ...(warn ? { warnedAt: new Date() } : {}), ...(exceeded ? { blockedAt: new Date() } : {}),
    } });
    if (exceeded) logger.error("ai_budget_estimate_exceeded", { generationId: id });
    return { closed: true, warn };
  });
  if (result.warn) logger.warn("ai_pilot_budget_75_percent", { budgetId });
  return result.closed;
}

async function closeReservation(reservation: Reservation, close: (generation: GenerationRow) => Closing): Promise<void> {
  try {
    await closeGeneration(reservation.budgetId, reservation.id, reservation.micros, close);
  } catch {
    // Preserve the hold on any uncertainty; never refund a paid generation
    // because telemetry failed, nor discard a valid recipe because of logging.
    logger.error("ai_budget_settlement_failed", { generationId: reservation.id });
  }
}

/** Exact final usage. No usage = keep the full hold, including after process/network failure (see reconcile-ai-holds). */
export async function settleGeneration(reservation: Reservation, usage?: AiUsage): Promise<void> {
  if (!usage) return;
  await closeReservation(reservation, () => ({ status: "settled", micros: usageMicros(reservation.rate, usage), usage }));
}

/** A4 — the provider answered with an HTTP error status before any stream event: nothing billable, release the whole hold. */
export async function releaseGeneration(reservation: Reservation): Promise<void> {
  await closeReservation(reservation, () => ({ status: "released", micros: 0 }));
}

/**
 * A4 — the stream started and was cut: the input (and cache) usage is exact,
 * but thinking is hidden, so the output is charged at its full ceiling and is
 * never under-counted.
 */
export async function settleInterruptedGeneration(reservation: Reservation, known: AiUsage): Promise<void> {
  await closeReservation(reservation, generation => {
    const usage = { ...known, outputTokens: generation.outputCeiling };
    return { status: "interrupted", micros: usageMicros(reservation.rate, usage), usage };
  });
}

/** A4 — reconciliation of a hold nobody closed (e.g. the process died). Throws on failure; the caller reports it. */
export async function expireGeneration(budgetId: string, id: string, chargeMicros: number): Promise<boolean> {
  if (!Number.isSafeInteger(chargeMicros) || chargeMicros < 0) throw new Error("invalid_charge");
  return closeGeneration(budgetId, id, undefined, generation => ({ status: "expired", micros: Math.min(chargeMicros, generation.reservedMicros) }));
}

export async function ownerBudgetStatus(userId: string) {
  if (!await isAiOwner(userId)) return null;
  const budget = await prisma.aiBudget.findUnique({ where: { id: "pilot" } });
  return budget ? {
    limit: budget.limitMicros / 1e6, used: budget.spentMicros / 1e6, reserved: budget.heldMicros / 1e6,
    endsAt: budget.endsAt.toISOString(), warning: !!budget.warnedAt, blocked: !!budget.blockedAt || budget.endsAt <= new Date(),
  } : { limit: PILOT_BUDGET_MICROS / 1e6, used: 0, reserved: 0, endsAt: null, warning: false, blocked: false };
}
