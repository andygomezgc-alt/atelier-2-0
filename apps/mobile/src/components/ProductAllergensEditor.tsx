import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { ALLERGEN_ORDER, type Allergen } from "@atelier/shared";
import { BottomSheet } from "./BottomSheet";
import { Button } from "./Button";
import { AllergenIcon } from "./AllergenIcon";
import { showToast } from "./Toast";
import { useI18n } from "@/src/hooks/useI18n";
import { apiErrorMessage } from "@/src/lib/api-error";
import { colors, fonts, spacing } from "@/src/theme";

export function ProductAllergensEditor({ allergens = [], reviewed = false, disabled = false, onSave }: {
  allergens?: Allergen[];
  reviewed?: boolean;
  disabled?: boolean;
  onSave: (allergens: Allergen[]) => Promise<void>;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Allergen[]>([]);
  const [saving, setSaving] = useState(false);
  const label = { fontFamily: fonts.sans, fontSize: 14, color: colors.ink };
  async function confirm() {
    if (saving) return;
    setSaving(true);
    try { await onSave(selected); setOpen(false); }
    catch (error) { showToast(apiErrorMessage(error, t)); }
    finally { setSaving(false); }
  }
  return (
    <View style={{ gap: spacing.sm, paddingVertical: spacing.md }}>
      <Text style={label}>{t("allergens_product_title")}</Text>
      <Text style={{ ...label, color: colors.inkSoft }}>
        {reviewed ? t("allergens_reviewed") : t("allergens_pending")}
        {allergens.length > 0 ? ` · ${allergens.map(a => t(`allergen_${a}`)).join(", ")}` : reviewed ? ` · ${t("allergens_none_declared")}` : ""}
      </Text>
      {!disabled && <Button variant="secondary" label={t("allergens_review_action")} onPress={() => { setSelected([...allergens]); setOpen(true); }} />}
      <BottomSheet open={open} onClose={() => { if (!saving) setOpen(false); }}>
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          <Text style={label}>{t("allergens_review_instruction")}</Text>
          <ScrollView style={{ maxHeight: 340 }}>
            {ALLERGEN_ORDER.map(a => <Pressable key={a} disabled={saving}
              accessibilityRole="checkbox" accessibilityState={{ checked: selected.includes(a) }}
              onPress={() => setSelected(values => values.includes(a) ? values.filter(v => v !== a) : [...values, a])}
              style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 12 }}>
              <Text style={label}>{selected.includes(a) ? "☑" : "☐"}</Text>
              <AllergenIcon allergen={a} size={18} />
              <Text style={label}>{t(`allergen_${a}`)}</Text>
            </Pressable>)}
          </ScrollView>
          <Button disabled={saving} label={selected.length ? t("allergens_confirm") : t("allergens_confirm_none")} onPress={() => void confirm()} />
        </View>
      </BottomSheet>
    </View>
  );
}
