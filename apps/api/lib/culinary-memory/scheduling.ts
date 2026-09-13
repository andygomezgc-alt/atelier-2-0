// Leave 30 seconds for final database writes and the HTTP response inside the
// 300-second platform limit. A new row needs the 45-second provider timeout
// plus a small database margin before it is safe to start.
export const CRON_DEADLINE_MS = 270_000;
export const MINIMUM_ROW_TIME_MS = 60_000;
export const MAINTENANCE_BUDGET_MS = 30_000;
