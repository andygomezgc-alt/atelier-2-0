import {
  parseReconcileArgs,
  planExpiries,
  settledHistoryWhere,
  staleHoldsWhere,
  summarizeHolds,
  type StaleHold,
} from "../lib/ai/budget-reconcile";

interface HoldQuery {
  where: ReturnType<typeof staleHoldsWhere>;
  select: Record<keyof StaleHold, true>;
  orderBy: Record<"createdAt", "asc">;
}

interface HistoryQuery {
  where: ReturnType<typeof settledHistoryWhere>;
  _max: Record<"chargedMicros", true>;
}

interface HistoryResult {
  _max: Record<"chargedMicros", number | null>;
}

interface ReconcileGenerationClient {
  findMany(query: HoldQuery): Promise<StaleHold[]>;
  aggregate(query: HistoryQuery): Promise<HistoryResult>;
}

interface ReconcilePrisma {
  aiGeneration: ReconcileGenerationClient;
  $disconnect(): Promise<void>;
}

interface ReconcileLog {
  log(message: string): void;
  error(message: string): void;
}

export interface ReconcileDependencies {
  prisma: ReconcilePrisma;
  expireGeneration(budgetId: string, generationId: string, chargeMicros: number): Promise<boolean>;
  now: Date;
  log: ReconcileLog;
}

/** Runs reconciliation without ambient database, clock, logging, or process state. */
export async function reconcileAiHolds(argv: string[], dependencies: ReconcileDependencies): Promise<number> {
  const { prisma, expireGeneration, now, log } = dependencies;
  try {
    const { apply, olderThanMinutes } = parseReconcileArgs(argv);
    const rows = await prisma.aiGeneration.findMany({
      where: staleHoldsWhere(now, olderThanMinutes),
      select: { id: true, budgetId: true, model: true, reservedMicros: true },
      orderBy: { createdAt: "asc" },
    });
    const highestByModel = new Map<string, number | null>();
    for (const model of new Set(rows.map(row => row.model))) {
      const history = await prisma.aiGeneration.aggregate({
        where: settledHistoryWhere(model, now),
        _max: { chargedMicros: true },
      });
      highestByModel.set(model, history._max.chargedMicros);
    }
    const plan = planExpiries(rows, highestByModel);
    log.log(JSON.stringify({
      mode: apply ? "apply" : "dry-run",
      olderThanMinutes,
      ...summarizeHolds(rows),
      chargeMicros: plan.reduce((total, item) => total + item.chargeMicros, 0),
      generations: plan,
    }));
    if (!apply) return 0;

    let expired = 0, skipped = 0, failed = 0;
    for (const item of plan) {
      try {
        if (await expireGeneration(item.budgetId, item.id, item.chargeMicros)) expired++;
        else skipped++; // Settled meanwhile by its own request.
      } catch (error) {
        failed++;
        log.error(JSON.stringify({
          evt: "reconcile_failed",
          generationId: item.id,
          error: error instanceof Error ? error.message : "unknown",
        }));
      }
    }
    log.log(JSON.stringify({ status: failed ? "partial" : "done", expired, skipped, failed }));
    return failed ? 1 : 0;
  } finally {
    await prisma.$disconnect();
  }
}
