import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { MenuServiceChargesSchema, type MenuServiceCharge } from "@atelier/shared";
import { patchMenu } from "@/src/api/menus";
import { useI18n } from "@/src/hooks/useI18n";
import { formatPrice, parseEurosToCents } from "@/src/lib/money";
import { apiErrorMessage } from "@/src/lib/api-error";
import { BottomSheet } from "./BottomSheet";
import { Button } from "./Button";
import { showToast } from "./Toast";
import { colors, fonts, fontSizes, spacing } from "@/src/theme";

type Draft = Omit<MenuServiceCharge, "price"> & { priceText: string };
type Props = { open: boolean; menuId: string; charges: MenuServiceCharge[];
  onClose: () => void; onSaved: () => Promise<unknown> };

export function MenuChargesSheet({ open, menuId, charges, onClose, onSaved }: Props) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<Draft[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setDraft(charges.map(({ price, ...charge }) => ({ ...charge, priceText: formatPrice(price) })));
  }, [open, menuId]);
  const change = (id: string, values: Partial<Draft>) => setDraft(rows => rows.map(row => row.id === id ? { ...row, ...values } : row));
  async function save() {
    if (busy) return;
    const parsed = MenuServiceChargesSchema.safeParse(draft.map(({ priceText, ...charge }) => ({ ...charge, price: parseEurosToCents(priceText) })));
    if (!parsed.success) { showToast(t("menu_charge_invalid")); return; }
    setBusy(true);
    try { await patchMenu(menuId, { serviceCharges: parsed.data }); await onSaved(); onClose(); }
    catch (err) { showToast(apiErrorMessage(err, t)); }
    finally { setBusy(false); }
  }
  return <BottomSheet open={open} onClose={() => { if (!busy) onClose(); }}>
    <View style={styles.content}>
      <Text style={styles.title}>{t("menu_charges")}</Text>
      <Text style={styles.note}>{t("menu_charges_note")}</Text>
      <ScrollView style={{ maxHeight: 380 }} keyboardShouldPersistTaps="handled">
        {draft.map(row => <View key={row.id} style={styles.card}>
          <TextInput style={styles.input} value={row.name} placeholder={t("menu_charge_name")} accessibilityLabel={t("menu_charge_name")}
            editable={!busy} maxLength={100} onChangeText={name => change(row.id, { name })} />
          <TextInput style={styles.input} value={row.priceText} placeholder={t("menu_charge_price")} accessibilityLabel={t("menu_charge_price")}
            editable={!busy} keyboardType="decimal-pad" maxLength={12} onChangeText={priceText => change(row.id, { priceText })} />
          <View style={styles.row}><Text style={styles.note}>{t("menu_charge_per_person")}</Text>
            <Switch value={row.perPerson} accessibilityLabel={t("menu_charge_per_person")} disabled={busy} onValueChange={perPerson => change(row.id, { perPerson })} /></View>
          <Button label={t("menu_charge_remove")} variant="ghost" disabled={busy} onPress={() => setDraft(rows => rows.filter(r => r.id !== row.id))} />
        </View>)}
      </ScrollView>
      <Button label={t("menu_charge_add")} variant="secondary" disabled={busy || draft.length >= 20}
        onPress={() => setDraft(rows => [...rows, { id: `charge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: "", priceText: "", perPerson: true }])} />
      <Button label={busy ? "…" : t("menu_save_changes")} disabled={busy} onPress={() => void save()} />
      <Button label={t("menu_cancel_changes")} variant="ghost" disabled={busy} onPress={onClose} />
    </View>
  </BottomSheet>;
}
const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.xl, gap: spacing.md, flexShrink: 1 },
  title: { fontFamily: fonts.serifItalic, fontSize: fontSizes.serifLg, color: colors.ink },
  note: { fontFamily: fonts.sans, fontSize: fontSizes.body, color: colors.mute },
  card: { gap: spacing.sm, paddingVertical: spacing.md },
  input: { color: colors.ink, fontFamily: fonts.sans, padding: spacing.md, borderWidth: 1, borderColor: colors.mute, borderRadius: 8 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
});
