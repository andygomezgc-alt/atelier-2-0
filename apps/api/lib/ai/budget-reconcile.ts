// A4 — pure rules for reconciling AI budget holds that nobody closed (the
// process died mid-generation). The script in scripts/reconcile-ai-holds.ts
// only wires these to Prisma.

export const DEFAULT_STALE_MINUTES = 30;
const HISTORY_DAYS = 30;

export type ReconcileOptions = { apply: boolean; olderThanMinutes: number };
export type StaleHold = { id: string; budgetId: string; model: string; reservedMicros: number };
export type PlannedExpiry = StaleHold & { chargeMicros: number };

/** `[--apply] [--older-than-minutes=N | --older-than-minutes N]`. Dry run by default. */
export function parseReconcileArgs(argv: string[]): ReconcileOptions {
  const options: ReconcileOptions = { apply: false, olderThanMinutes: DEFAULT_STALE_MINUTES };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--apply") options.apply = true;
    else if (arg === "--older-than-minutes" || arg.startsWith("--older-than-minutes=")) {
      const value = arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : argv[++i];
      const minutes = Number(value);
      if (!value || !Number.isSafeInteger(minutes) || minutes <= 0) throw new Error("--older-than-minutes needs a positive whole number");
      options.olderThanMinutes = minutes;
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

/** Holds still `reserved` after the threshold; far above the 240 s chat deadline. */
export function staleHoldsWhere(now: Date, olderThanMinutes: number) {
  return { status: "reserved", createdAt: { lt: new Date(+now - olderThanMinutes * 60_000) } };
}

/** Exactly billed generations of the same model in the last 30 days. */
export function settledHistoryWhere(model: string, now: Date) {
  return { model, status: "settled", chargedMicros: { not: null }, finishedAt: { gte: new Date(+now - HISTORY_DAYS * 86_400_000) } };
}

/** The highest recent real cost of the model, never above the hold; the whole hold without history. */
export function expiryCharge(reservedMicros: number, highestSettled: number | null | undefined): number {
  return highestSettled === null || highestSettled === undefined ? reservedMicros : Math.min(reservedMicros, highestSettled);
}

export function planExpiries(rows: StaleHold[], highestByModel: Map<string, number | null>): PlannedExpiry[] {
  return rows.map(row => ({ ...row, chargeMicros: expiryCharge(row.reservedMicros, highestByModel.get(row.model)) }));
}

export function summarizeHolds(rows: Array<{ reservedMicros: number }>) {
  return { count: rows.length, heldMicros: rows.reduce((total, row) => total + row.reservedMicros, 0) };
}
