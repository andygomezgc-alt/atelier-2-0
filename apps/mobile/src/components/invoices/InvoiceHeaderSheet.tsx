// Correct what was read in the header: the supplier (one already known, or a typed name), the
// number and the day. Only what changed is sent.
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { InvoiceDetail, InvoiceHeaderPatch } from "@atelier/shared";
import { BottomSheet } from "@/src/components/BottomSheet";
import { Button } from "@/src/components/Button";
import { useI18n } from "@/src/hooks/useI18n";
import { buildHeaderPatch, formatDayInput, type HeaderForm } from "@/src/lib/invoice-view";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

type Props = {
  open: boolean;
  invoice: Pick<InvoiceDetail, "supplier" | "number" | "issuedOn">;
  suppliers: ReadonlyArray<{ id: string; name: string }>;
  onSave: (patch: InvoiceHeaderPatch) => Promise<void>;
  onClose: () => void;
};

const initialSupplier = (invoice: Props["invoice"]): HeaderForm["supplier"] =>
  invoice.supplier ? { kind: "existing", id: invoice.supplier.id } : { kind: "new", name: "" };

export function InvoiceHeaderSheet({ open, invoice, suppliers, onSave, onClose }: Props) {
  const { t } = useI18n();
  const [supplier, setSupplier] = useState<HeaderForm["supplier"]>(initialSupplier(invoice));
  const [number, setNumber] = useState(invoice.number ?? "");
  const [day, setDay] = useState(invoice.issuedOn ? formatDayInput(invoice.issuedOn) : "");
  const [dateInvalid, setDateInvalid] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSupplier(initialSupplier(invoice));
    setNumber(invoice.number ?? "");
    setDay(invoice.issuedOn ? formatDayInput(invoice.issuedOn) : "");
    setDateInvalid(false);
  }, [open, invoice.supplier?.id, invoice.number, invoice.issuedOn]); // eslint-disable-line react-hooks/exhaustive-deps

  const known = [...(invoice.supplier ? [invoice.supplier] : []), ...suppliers.filter((s) => s.id !== invoice.supplier?.id)];

  const save = async () => {
    const patch = buildHeaderPatch(invoice, { supplier, number, day });
    if (patch === "invalid_date") {
      setDateInvalid(true);
      return;
    }
    setDateInvalid(false);
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      await onSave(patch);
      onClose();
    } catch {
      // The screen already said why; the sheet stays open with what the chef typed.
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose}>
      <Text style={styles.title}>{t("invoice_header_title")}</Text>
      <ScrollView keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>{t("invoice_supplier_label")}</Text>
        <View style={styles.chips}>
          {known.map((s) => {
            const selected = supplier.kind === "existing" && supplier.id === s.id;
            return (
              <Pressable
                key={s.id}
                accessibilityRole="button"
                accessibilityLabel={s.name}
                accessibilityState={{ selected }}
                style={[styles.chip, selected && styles.chipOn]}
                onPress={() => setSupplier({ kind: "existing", id: s.id })}
              >
                <Text style={[styles.chipText, selected && styles.chipTextOn]}>{s.name}</Text>
              </Pressable>
            );
          })}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("invoice_header_supplier_new")}
            accessibilityState={{ selected: supplier.kind === "new" }}
            style={[styles.chip, supplier.kind === "new" && styles.chipOn]}
            onPress={() => setSupplier({ kind: "new", name: "" })}
          >
            <Text style={[styles.chipText, supplier.kind === "new" && styles.chipTextOn]}>{t("invoice_header_supplier_new")}</Text>
          </Pressable>
        </View>
        {supplier.kind === "new" ? (
          <TextInput
            accessibilityLabel={t("invoice_header_supplier_placeholder")}
            value={supplier.name}
            onChangeText={(name) => setSupplier({ kind: "new", name })}
            placeholder={t("invoice_header_supplier_placeholder")}
            placeholderTextColor={colors.mute}
            style={styles.input}
          />
        ) : null}
        <Text style={styles.label}>{t("invoice_number_label")}</Text>
        <TextInput
          accessibilityLabel={t("invoice_number_label")}
          value={number}
          onChangeText={setNumber}
          placeholder={t("invoice_header_number_placeholder")}
          placeholderTextColor={colors.mute}
          autoCapitalize="characters"
          style={styles.input}
        />
        <Text style={styles.label}>{t("invoice_date_label")}</Text>
        <TextInput
          accessibilityLabel={t("invoice_date_label")}
          value={day}
          onChangeText={setDay}
          placeholder={t("invoice_header_date_placeholder")}
          placeholderTextColor={colors.mute}
          keyboardType="numbers-and-punctuation"
          style={styles.input}
        />
        {dateInvalid ? <Text style={styles.error}>{t("invoice_header_date_invalid")}</Text> : null}
        <Button label={t("invoice_header_save")} disabled={saving} onPress={save} />
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.serifMedium, fontSize: fontSizes.serifMd, color: colors.ink, marginBottom: spacing.md },
  label: { fontFamily: fonts.sans, fontSize: fontSizes.caption, color: colors.mute, marginTop: spacing.md, marginBottom: spacing.xs },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { borderWidth: 1, borderColor: colors.edge, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  chipOn: { backgroundColor: colors.teal, borderColor: colors.teal },
  chipText: { fontFamily: fonts.sans, fontSize: fontSizes.bodySm, color: colors.ink },
  chipTextOn: { color: colors.paper },
  input: {
    fontFamily: fonts.sans, fontSize: fontSizes.bodyLg, color: colors.ink, borderWidth: 1, borderColor: colors.edge,
    borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  error: { fontFamily: fonts.sans, fontSize: fontSizes.bodySm, color: colors.danger, marginTop: spacing.xs },
});
