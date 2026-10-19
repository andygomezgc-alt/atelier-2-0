import { describe, expect, it } from "vitest";
import { t as translate, type TranslationKey } from "@atelier/i18n";
import { relativeAge } from "../relative-age";

const createdAt = "2026-10-06T10:00:00Z";
const after = (minutes: number) => new Date(createdAt).getTime() + minutes * 60_000;
const keys = (key: TranslationKey, vars?: Record<string, string | number>) => (vars ? `${key}:${vars.n}` : key);
const es = (key: TranslationKey, vars?: Record<string, string | number>) => translate(key, "es", vars);

describe("relativeAge", () => {
  it("says a few minutes within the first hour, also for a clock slightly behind the server", () => {
    expect(relativeAge(createdAt, after(0), keys)).toBe("relative_minutes_ago");
    expect(relativeAge(createdAt, after(59), keys)).toBe("relative_minutes_ago");
    expect(relativeAge(createdAt, after(-3), keys)).toBe("relative_minutes_ago");
  });

  it("counts whole hours, then days, weeks, and stops at over a month", () => {
    expect(relativeAge(createdAt, after(60), keys)).toBe("relative_hours_ago:1");
    expect(relativeAge(createdAt, after(23 * 60 + 59), keys)).toBe("relative_hours_ago:23");
    expect(relativeAge(createdAt, after(3 * 24 * 60), keys)).toBe("relative_days_ago:3");
    expect(relativeAge(createdAt, after(3 * 7 * 24 * 60), keys)).toBe("relative_weeks_ago:3");
    expect(relativeAge(createdAt, after(5 * 7 * 24 * 60), keys)).toBe("relative_months_ago");
  });

  it("uses a wording without a number for one day and one week, since the copy has no plurals", () => {
    expect(relativeAge(createdAt, after(24 * 60), keys)).toBe("relative_day_ago");
    expect(relativeAge(createdAt, after(47 * 60), keys)).toBe("relative_day_ago");
    expect(relativeAge(createdAt, after(7 * 24 * 60), keys)).toBe("relative_week_ago");
    expect(relativeAge(createdAt, after(13 * 24 * 60), keys)).toBe("relative_week_ago");
    expect(relativeAge(createdAt, after(24 * 60), es)).toBe("hace un día");
    expect(relativeAge(createdAt, after(2 * 60), es)).toBe("hace 2 h");
  });

  it("returns nothing for a date it cannot read", () => {
    expect(relativeAge("not a date", after(0), keys)).toBe("");
  });
});
