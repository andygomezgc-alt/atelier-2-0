// Sheet de presets para crear una sección. Los presets salen de i18n: cada
// chef los ve en el idioma de la app y la sección se crea con ese nombre.
//
// "Personalizada" abre un TextInput para nombre custom.

import { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { TranslationKey } from "@atelier/i18n";
import { useI18n } from "@/src/hooks/useI18n";
import { BottomSheet } from "./BottomSheet";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

const PRESETS: ReadonlyArray<TranslationKey> = [
  "section_preset_cold_starters",
  "section_preset_hot_starters",
  "section_preset_first_courses",
  "section_preset_sea_mains",
  "section_preset_land_mains",
  "section_preset_sides",
  "section_preset_pre_dessert",
  "section_preset_desserts",
  "section_preset_petits_fours",
];

type Props = {
  open: boolean;
  onClose: () => void;
  onPick: (name: string) => void;
};

export function SectionPresetSheet({ open, onClose, onPick }: Props) {
  const { t } = useI18n();
  const [customName, setCustomName] = useState("");

  function handlePreset(name: string) {
    onPick(name);
    onClose();
  }

  function handleCustom() {
    const name = customName.trim();
    if (!name) return;
    setCustomName("");
    onPick(name);
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      <Text style={styles.title}>{t("section_add")}</Text>
        <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
          <View style={styles.grid}>
            {PRESETS.map((key) => {
              const name = t(key);
              return (
                <Pressable
                  key={key}
                  style={styles.chip}
                  onPress={() => handlePreset(name)}
                >
                  <Text style={styles.chipLabel}>{name}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.customRow}>
            <TextInput
              value={customName}
              onChangeText={setCustomName}
              placeholder={t("section_name_placeholder")}
              placeholderTextColor={colors.mute}
              style={styles.customInput}
              returnKeyType="done"
              onSubmitEditing={handleCustom}
            />
            <Pressable
              onPress={handleCustom}
              disabled={!customName.trim()}
              style={[styles.customBtn, !customName.trim() && styles.customBtnDisabled]}
              hitSlop={8}
            >
              <Ionicons name="add" size={18} color={colors.paper} />
            </Pressable>
          </View>
        </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSizes.serifLg,
    color: colors.ink,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  list: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 0.5,
    borderColor: colors.terracota,
    backgroundColor: colors.paperSoft,
  },
  chipLabel: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSizes.serifBodySm,
    color: colors.terracota,
  },
  customRow: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
    marginTop: spacing.md,
  },
  customInput: {
    flex: 1,
    backgroundColor: colors.paper,
    borderWidth: 0.5,
    borderColor: colors.edge,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontFamily: fonts.sans,
    fontSize: fontSizes.body,
    color: colors.ink,
  },
  customBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.terracota,
    alignItems: "center",
    justifyContent: "center",
  },
  customBtnDisabled: { opacity: 0.4 },
});
