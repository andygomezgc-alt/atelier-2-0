// Bloque 5 — Sheet para crear un menú nuevo. Reemplaza el input inline que
// estaba en (tabs)/menus.tsx. Disparado por el botón "+" del header
// editorial. Solo nombre — el resto (season, items, etc.) se edita después
// dentro del menú.

import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useI18n } from "@/src/hooks/useI18n";
import { BottomSheet } from "./BottomSheet";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string) => Promise<void>;
};

export function NewMenuSheet({ open, onClose, onCreate }: Props) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setCreating(false);
    }
  }, [open]);

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    try {
      await onCreate(trimmed);
      onClose();
    } finally {
      setCreating(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      <View style={styles.body}>
          <Text style={styles.title}>{t("menus_new_modal_title")}</Text>
          <TextInput
            autoFocus
            value={name}
            onChangeText={setName}
            placeholder={t("menus_new_modal_placeholder")}
            placeholderTextColor={colors.mute}
            style={styles.input}
            maxLength={120}
            onSubmitEditing={handleCreate}
            editable={!creating}
          />
          <View style={styles.actions}>
            <Pressable
              onPress={onClose}
              style={styles.btnGhost}
              disabled={creating}
            >
              <Text style={styles.btnGhostLabel}>{t("confirm_cancel")}</Text>
            </Pressable>
            <Pressable
              onPress={handleCreate}
              disabled={!name.trim() || creating}
              style={[
                styles.btnPrimary,
                (!name.trim() || creating) && styles.btnDisabled,
              ]}
            >
              <Text style={styles.btnPrimaryLabel}>
                {creating ? "…" : t("menus_new_modal_create")}
              </Text>
            </Pressable>
          </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  title: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSizes.serifLg,
    color: colors.ink,
  },
  input: {
    backgroundColor: colors.paper,
    borderWidth: 0.5,
    borderColor: colors.edge,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontFamily: fonts.sans,
    fontSize: fontSizes.body,
    color: colors.ink,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: spacing.sm,
  },
  btnGhost: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  btnGhostLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.mute,
    fontWeight: "600",
    letterSpacing: 1.2,
  },
  btnPrimary: {
    backgroundColor: colors.terracota,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs + 2,
  },
  btnDisabled: { opacity: 0.5 },
  btnPrimaryLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.paper,
    fontWeight: "600",
    letterSpacing: 1.2,
  },
});
