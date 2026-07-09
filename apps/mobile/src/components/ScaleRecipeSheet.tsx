import { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { BottomSheet } from "./BottomSheet";
import { Button } from "./Button";
import { useI18n } from "@/src/hooks/useI18n";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

type Props = {
  open: boolean;
  currentPortions: number;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (fromPortions: number, toPortions: number) => void;
};

// Escalar porciones: el chef confirma de cuántas porciones ES la receta y a
// cuántas la quiere. Crea una copia con las cantidades reajustadas.
export function ScaleRecipeSheet({ open, currentPortions, busy, onClose, onConfirm }: Props) {
  const { t } = useI18n();
  const [from, setFrom] = useState("1");
  const [to, setTo] = useState("");

  useEffect(() => {
    if (open) {
      setFrom(String(currentPortions > 0 ? currentPortions : 1));
      setTo("");
    }
  }, [open, currentPortions]);

  const fromN = parseInt(from, 10);
  const toN = parseInt(to, 10);
  const valid = fromN > 0 && fromN <= 1000 && toN > 0 && toN <= 1000;

  return (
    <BottomSheet open={open} onClose={onClose}>
      <View style={styles.body}>
        <Text style={styles.title}>{t("scale_title")}</Text>
        <Text style={styles.sub}>{t("scale_sub")}</Text>
        <View style={styles.row}>
          <View style={styles.field}>
            <Text style={styles.label}>{t("scale_from")}</Text>
            <TextInput
              style={styles.input}
              value={from}
              onChangeText={setFrom}
              keyboardType="number-pad"
              maxLength={4}
              selectTextOnFocus
            />
          </View>
          <Text style={styles.arrow}>→</Text>
          <View style={styles.field}>
            <Text style={styles.label}>{t("scale_to")}</Text>
            <TextInput
              style={styles.input}
              value={to}
              onChangeText={setTo}
              keyboardType="number-pad"
              maxLength={4}
              placeholder="—"
              placeholderTextColor={colors.mute}
              autoFocus
            />
          </View>
        </View>
        <Button
          label={t("scale_confirm")}
          onPress={() => valid && onConfirm(fromN, toN)}
          disabled={!valid || busy}
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.lg, gap: spacing.md },
  title: { fontFamily: fonts.serifMedium, fontSize: fontSizes.serifMd, color: colors.ink },
  sub: { fontFamily: fonts.sans, fontSize: fontSizes.bodySm, color: colors.mute },
  row: { flexDirection: "row", alignItems: "flex-end", justifyContent: "center", gap: spacing.md },
  field: { alignItems: "center", gap: spacing.xs },
  label: { fontFamily: fonts.sans, fontSize: fontSizes.bodySm, color: colors.mute },
  input: {
    width: 90,
    textAlign: "center",
    fontFamily: fonts.serifMedium,
    fontSize: fontSizes.serifMd,
    color: colors.ink,
    backgroundColor: colors.paperSoft,
    borderWidth: 0.5,
    borderColor: colors.edge,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
  },
  arrow: { fontSize: fontSizes.serifMd, color: colors.terracota, paddingBottom: spacing.sm },
});
