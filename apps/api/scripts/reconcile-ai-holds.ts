// A4 — closes AI budget holds that nobody settled (the process died mid-generation).
// Dry run by default: lists `reserved` generations older than the threshold.
// With --apply, expires each one in its own row-locked transaction, charging the
// highest settled cost of the same model in the last 30 days (capped by the hold),
// or the whole hold without history. No provider calls.
// From apps/api: ../../packages/db/node_modules/.bin/tsx scripts/reconcile-ai-holds.ts [--apply] [--older-than-minutes=30]
import { prisma } from "@atelier/db";
import { expireGeneration } from "../lib/ai/budget";
import { parseReconcileArgs, planExpiries, settledHistoryWhere, staleHoldsWhere, summarizeHolds } from "../lib/ai/budget-reconcile";

async function main() {
  const { apply, olderThanMinutes } = parseReconcileArgs(process.argv.slice(2));
  const now = new Date();
  try {
    const rows = await prisma.aiGeneration.findMany({
      where: staleHoldsWhere(now, olderThanMinutes),
      select: { id: true, budgetId: true, model: true, reservedMicros: true },
      orderBy: { createdAt: "asc" },
    });
    const highestByModel = new Map<string, number | null>();
    for (const model of new Set(rows.map(row => row.model))) {
      const history = await prisma.aiGeneration.aggregate({ where: settledHistoryWhere(model, now), _max: { chargedMicros: true } });
      highestByModel.set(model, history._max.chargedMicros);
    }
    const plan = planExpiries(rows, highestByModel);
    console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", olderThanMinutes, ...summarizeHolds(rows),
      chargeMicros: plan.reduce((total, item) => total + item.chargeMicros, 0), generations: plan }));
    if (!apply) return;
    let expired = 0, skipped = 0, failed = 0;
    for (const item of plan) {
      try {
        if (await expireGeneration(item.budgetId, item.id, item.chargeMicros)) expired++;
        else skipped++; // Settled meanwhile by its own request.
      } catch (error) {
        failed++;
        console.error(JSON.stringify({ evt: "reconcile_failed", generationId: item.id, error: error instanceof Error ? error.message : "unknown" }));
      }
    }
    console.log(JSON.stringify({ status: failed ? "partial" : "done", expired, skipped, failed }));
    if (failed) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Reconciliation failed"); process.exitCode = 1; });
