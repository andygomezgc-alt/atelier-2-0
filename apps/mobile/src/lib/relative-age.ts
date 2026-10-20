// "2 h ago" for a timestamp, in the app language. The copy has no plurals, so one day and
// one week use their own wording without a number, and a count is only shown from two up.
import type { TranslationKey } from "@atelier/i18n";

type T = (key: TranslationKey, vars?: Record<string, string | number>) => string;

export function relativeAge(iso: string, now: number, t: T): string {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return "";
  const minutes = Math.floor((now - time) / 60_000);
  if (minutes < 60) return t("relative_minutes_ago");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("relative_hours_ago", { n: hours });
  const days = Math.floor(hours / 24);
  if (days === 1) return t("relative_day_ago");
  if (days < 7) return t("relative_days_ago", { n: days });
  const weeks = Math.floor(days / 7);
  if (weeks === 1) return t("relative_week_ago");
  if (weeks < 5) return t("relative_weeks_ago", { n: weeks });
  return t("relative_months_ago");
}
