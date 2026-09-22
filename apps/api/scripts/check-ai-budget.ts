// Synthetic transactions only. No provider calls or production writes.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@atelier/db";
import { isAiOwner, reserveGeneration, settleGeneration } from "../lib/ai/budget";
import { OWNER_EMAIL, reservationMicros, usageMicros, modelRate, AiBudgetError } from "../lib/ai/budget-policy";
import { recordAiTokens, utcDay, AI_DAILY_LIMIT } from "../lib/ai-quota";

async function main() {
  assert.equal(new URL(process.env.DATABASE_URL!).hostname, "ep-summer-heart-alhlh8nm-pooler.c-3.eu-central-1.aws.neon.tech", "QA only");
  const suffix = randomUUID();
  const budgetId = `budget-qa-${suffix}`, userId = `budget-user-${suffix}`;
  const now = new Date("2026-09-10T12:00:00Z");
  const config = { task: "daily" as const, model: "gemini-3.8-flash", maxTokens: 1000 };
  const reserve = (c = config, id: string | undefined = userId, time = now) => reserveGeneration(c, 1000, id, time, budgetId);
  const code = (c: string) => (error: unknown) => error instanceof AiBudgetError && error.code === c;
  let owner = await prisma.user.findUnique({ where: { email: OWNER_EMAIL } });
  const createdOwner = !owner;
  try {
    if (!owner) owner = await prisma.user.create({ data: { name: "Budget QA owner", email: OWNER_EMAIL } });
    await prisma.user.create({ data: { id: userId, name: "Budget QA", email: `${userId}@example.test`, role: "admin" } });
    assert.equal(await isAiOwner(userId), false, "Restaurant admin is not a quota exemption");
    assert.equal(await isAiOwner(owner.id), true);
    await prisma.aiChatQuota.create({ data: { userId, day: "2026-09-10", dailyCount: 20, dailyAt: Array.from({ length: 139 }, () => new Date(+now - 1000)), creativeAt: [] } });
    await prisma.aiUsage.create({ data: { userId, day: utcDay(), requestCount: AI_DAILY_LIMIT } });

    let attempts = await Promise.allSettled(Array.from({ length: 5 }, () => reserve()));
    assert.equal(attempts.filter(r => r.status === "fulfilled").length, 1, "Exactly 140 Daily generations under concurrency, even on one day");
    for (const attempt of attempts) if (attempt.status === "rejected") assert.ok(code("ai_daily_weekly_limit")(attempt.reason));
    assert.equal(await prisma.aiGeneration.count({ where: { budgetId } }), 1, "Rejected quotas do not leave reservations");
    const daily = await prisma.aiChatQuota.findUniqueOrThrow({ where: { userId } });
    assert.equal(daily.dailyAt.length, 140);
    await recordAiTokens(userId, 1000, 500);
    const telemetry = await prisma.aiUsage.findUniqueOrThrow({ where: { userId_day: { userId, day: utcDay() } } });
    assert.equal(telemetry.requestCount, AI_DAILY_LIMIT, "Chat telemetry does not consume technical-action quota");
    assert.equal(telemetry.inputTokens, 1000);
    const creative = { ...config, task: "creative" as const, model: "claude-opus-5-5" };
    await prisma.aiChatQuota.update({ where: { userId }, data: { creativeAt: Array.from({ length: 7 }, () => new Date(+now - 1000)) } });
    attempts = await Promise.allSettled(Array.from({ length: 5 }, () => reserveGeneration(creative, 1000, userId, now, budgetId)));
    assert.equal(attempts.filter(r => r.status === "fulfilled").length, 1, "Exactly eight Creative responses under concurrency");
    await assert.rejects(reserveGeneration(creative, 1000, userId, new Date("2026-09-11T12:00Z"), budgetId), code("ai_creative_limit"));
    await assert.rejects(reserve(config, userId, new Date("2026-09-11T00:00Z")), code("ai_daily_weekly_limit"));
    const beforeExpiry = new Date("2026-09-17T11:59:58Z");
    await assert.rejects(reserve(config, userId, beforeExpiry), (error: unknown) => code("ai_daily_weekly_limit")(error) && (error as AiBudgetError).retryAfter === 1);
    await reserve(config, userId, new Date(+beforeExpiry + 1000));
    assert.equal((await prisma.aiChatQuota.findUniqueOrThrow({ where: { userId } })).dailyAt.length, 2, "Only expired uses are released");

    // Seed the owner's quota as exhausted; the explicit identity exemption must
    // bypass it without changing existing owner quota state after the test.
    const ownerQuota = await prisma.aiChatQuota.findUnique({ where: { userId: owner.id } });
    try {
      const fullOwnerQuota = { day: "2026-09-10", dailyCount: 999, dailyAt: Array.from({ length: 140 }, () => now), creativeAt: Array.from({ length: 8 }, () => now) };
      await prisma.aiChatQuota.upsert({ where: { userId: owner.id }, create: { userId: owner.id, ...fullOwnerQuota }, update: fullOwnerQuota });
      await Promise.all([reserve(config, owner.id), reserveGeneration(creative, 1000, owner.id, now, budgetId)]);
    } finally {
      if (ownerQuota) await prisma.aiChatQuota.update({ where: { userId: owner.id }, data: { day: ownerQuota.day, dailyCount: ownerQuota.dailyCount, dailyAt: ownerQuota.dailyAt, creativeAt: ownerQuota.creativeAt } });
      else await prisma.aiChatQuota.delete({ where: { userId: owner.id } });
    }

    // Start a deliberately tiny allowance, with room for two simultaneous calls.
    await prisma.aiGeneration.deleteMany({ where: { budgetId } });
    const cost = reservationMicros(config.model, 1000, 1000, now).micros;
    await prisma.aiBudget.update({ where: { id: budgetId }, data: { spentMicros: 0, heldMicros: 0, limitMicros: cost * 2 } });
    attempts = await Promise.allSettled(Array.from({ length: 5 }, () => reserve(config, owner!.id)));
    const accepted = attempts.flatMap(r => r.status === "fulfilled" ? [r.value] : []);
    assert.equal(accepted.length, 2, "Owner cannot bypass the shared spending cap");
    await assert.rejects(reserve(config, owner.id), code("ai_budget_exhausted"));
    const before = await prisma.aiBudget.findUniqueOrThrow({ where: { id: budgetId } });
    await settleGeneration(accepted[0]!); // Disconnected: no refund.
    assert.equal((await prisma.aiBudget.findUniqueOrThrow({ where: { id: budgetId } })).heldMicros, before.heldMicros);
    const usage = { inputTokens: 100, outputTokens: 100, cachedTokens: 20, reasoningTokens: 80 };
    await Promise.all([settleGeneration(accepted[0]!, usage), settleGeneration(accepted[0]!, usage)]);
    const after = await prisma.aiBudget.findUniqueOrThrow({ where: { id: budgetId } });
    assert.equal(after.spentMicros, usageMicros(modelRate(config.model, now), usage));
    assert.equal(after.heldMicros, cost, "Settlement and refund happen once");
    await prisma.aiBudget.update({ where: { id: budgetId }, data: { endsAt: new Date(+now - 1), startsAt: new Date(+now - 86400000) } });
    await assert.rejects(reserve(config, owner.id), code("ai_budget_expired"));
    assert.equal(await prisma.aiBudget.count({ where: { id: budgetId } }), 1, "Expired pilot does not renew itself");
    await assert.rejects(reserveGeneration({ ...config, model: "unknown-model" }, 100, userId, now, budgetId), code("ai_budget_unavailable"));

    // Unexpected billed usage trips the circuit, never silently clamps cost.
    await settleGeneration(accepted[1]!, { ...usage, inputTokens: 10000, outputTokens: 10000 });
    assert.ok((await prisma.aiBudget.findUniqueOrThrow({ where: { id: budgetId } })).blockedAt);
    await assert.rejects(reserve(config, owner.id), code("ai_budget_unavailable"));
    console.log(JSON.stringify({ status: "passed", realAiCalls: 0, checks: ["140 Daily under concurrency", "Creative rolling quota", "no reset at midnight", "exact weekly expiry", "separate technical quota and chat telemetry", "explicit owner exemption", "owner still budgeted", "atomic global spending cap", "unknown cost retained", "idempotent settlement", "no automatic renewal", "unknown tariff denied", "unexpected usage circuit breaker"] }));
  } finally {
    await prisma.aiGeneration.deleteMany({ where: { budgetId } });
    await prisma.aiBudget.deleteMany({ where: { id: budgetId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    if (createdOwner && owner) await prisma.user.delete({ where: { id: owner.id } });
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "QA failed"); process.exitCode = 1; });
