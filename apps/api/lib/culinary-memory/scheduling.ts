// Leave 30 seconds for final database writes and the HTTP response inside the
// 300-second platform limit. A new row needs the 45-second provider timeout
// plus a small database margin before it is safe to start.
export const CRON_DEADLINE_MS = 270_000;
export const MINIMUM_ROW_TIME_MS = 60_000;
export const MAINTENANCE_BUDGET_MS = 30_000;

// An import run belongs to the request that saved the recipe (300 s with maxDuration). Its deadline is
// anchored at the start of that request and keeps the same 30-second final margin as the cron.
export const IMPORT_DEADLINE_MS = 270_000;
// Imports closer together than this share one paid run: each run waits this long in silence first.
// It must leave the worst save (40 s) plus one row (MINIMUM_ROW_TIME_MS) inside IMPORT_DEADLINE_MS.
export const IMPORT_QUIET_MS = 170_000;
export const IMPORT_QUIET_CHECK_MS = 15_000;
