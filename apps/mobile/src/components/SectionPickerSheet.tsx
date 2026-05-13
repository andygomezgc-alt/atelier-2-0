// Picker para asignar un plato a una sección del menú (o desasignarlo).
//
// Patrón: el padre abre la sheet con el item actual; la sheet lista las
// secciones del menú + una opción "Sin sección" para limpiar. Al tocar una
// opción llama a `onPick(sectionId | null)` y se cierra.

import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useI18n } from "@/src/hooks/useI18n";
import { type Section } from "@/src/api/menus";
import { BottomSheet } from "./BottomSheet";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

type Props = {
  open: boolean;
  sections: Section[];
  currentSectionId: string | null;
  onPick: (sectionId: string | null) => void;
  onClose: () => void;
};

export function SectionPickerSheet({
  open,
  sections,
  currentSectionId,
  onPick,
  onClose,
}: Props) {
  const { t } = useI18n();
  const sorted = [...(sections ?? [])].sort((a, b) => a.order - b.order);

  return (
    <BottomSheet open={open} onClose={onClose}>
      <Text style={styles.title}>{t("section_add")}</Text>
      <ScrollView contentContainerStyle={styles.list}>
        {sorted.map((s) => {
          const active = s.id === currentSectionId;
          return (
            <Pressable
              key={s.id}
              style={[styles.row, active && styles.rowActive]}
              onPress={() => {
                onPick(s.id);
                onClose();
              }}
            >
              <Text style={[styles.label, active && styles.labelActive]}>
                {s.name}
              </Text>
              {active ? (
                <Ionicons name="checkmark" size={18} color={colors.terracota} />
              ) : null}
            </Pressable>
          );
        })}
        <Pressable
          style={[styles.row, currentSectionId === null && styles.rowActive]}
          onPress={() => {
            onPick(null);
            onClose();
          }}
        >
          <Text style={[styles.labelMute, currentSectionId === null && styles.labelActive]}>
            {t("section_unassigned")}
          </Text>
          {currentSectionId === null ? (
            <Ionicons name="checkmark" size={18} color={colors.terracota} />
          ) : null}
        </Pressable>
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: fonts.serif,
    fontStyle: "italic",
    fontSize: fontSizes.serifLg,
    color: colors.ink,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  list: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    gap: spacing.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    backgroundColor: colors.paper,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderWidth: 0.5,
    borderColor: colors.edge,
  },
  rowActive: {
    borderColor: colors.terracota,
    backgroundColor: colors.terracotaSoft,
  },
  label: {
    fontFamily: fonts.serif,
    fontStyle: "italic",
    fontSize: fontSizes.body,
    color: colors.ink,
  },
  labelMute: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.body,
    color: colors.mute,
    fontStyle: "italic",
  },
  labelActive: { color: colors.terracota, fontWeight: "600" },
});
