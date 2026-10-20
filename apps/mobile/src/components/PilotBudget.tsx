import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { apiFetch } from "@/src/api/client";
import { useI18n } from "@/src/hooks/useI18n";
import { colors, fontSizes, spacing } from "@/src/theme";

type Budget = { limit: number; used: number; reserved: number; warning: boolean; blocked: boolean; endsAt: string | null };
export function PilotBudget({ open, userId }: { open: boolean; userId: string }) {
  const { t } = useI18n();
  const [value, setValue] = useState<{ userId: string; budget: Budget } | null>(null);
  useEffect(() => {
    if (!open) return;
    let current = true;
    setValue(null);
    apiFetch<{ budget: Budget | null }>("/api/ai-budget").then(({ budget }) => {
      if (current && budget) setValue({ userId, budget });
    }).catch(() => { /* A budget read must not interrupt profile editing. */ });
    return () => { current = false; };
  }, [open, userId]);
  if (!open || value?.userId !== userId) return null;
  const budget = value.budget;
  const used = budget.used + budget.reserved;
  const nearLimit = budget.warning || used >= budget.limit * .75;
  // A thin bar of the spend, pending reservations included, capped at full.
  const pct = Math.round((budget.limit > 0 ? Math.min(1, used / budget.limit) : 1) * 100);
  const fill = budget.blocked ? colors.danger : nearLimit ? colors.amber : colors.teal;
  return <View style={{ paddingVertical: spacing.md, gap: spacing.xs }}>
    <Text style={{ color: colors.ink, fontSize: fontSizes.body }}>{t("ai_budget_title")} · {t("ai_budget_value", { used: used.toFixed(2), limit: budget.limit.toFixed(2) })}</Text>
    <View accessibilityRole="progressbar" accessibilityLabel={t("ai_budget_title")} accessibilityValue={{ min: 0, max: 100, now: pct }} style={{ height: 4, borderRadius: 2, backgroundColor: colors.edge, overflow: "hidden" }}>
      <View testID="ai-budget-fill" style={{ width: `${pct}%`, height: "100%", backgroundColor: fill }} />
    </View>
    <Text style={{ color: colors.ink, fontSize: fontSizes.bodySm }}>{t("ai_budget_left", { left: Math.max(0, budget.limit - used).toFixed(2) })}</Text>
    <Text style={{ color: colors.ink, fontSize: fontSizes.bodySm }}>{t("ai_budget_note")}</Text>
    {(budget.blocked || nearLimit) && <Text accessibilityLiveRegion="polite" style={{ color: colors.ink, fontSize: fontSizes.body }}>{t(budget.blocked ? "ai_budget_closed" : "ai_budget_warning")}</Text>}
  </View>;
}
