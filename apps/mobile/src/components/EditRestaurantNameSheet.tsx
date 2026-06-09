// Gestión de equipo F1 — Editar nombre del sitio (solo admin).
// Sheet chico tipo NewMenuSheet: input + Cancelar/Guardar. NO inline para no
// pisar el hero serif italic del Casa.

import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useI18n } from "@/src/hooks/useI18n";
import { BottomSheet } from "./BottomSheet";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

type Props = {
  open: boolean;
  initialName: string;
  onClose: () => void;
  // El caller hace el PATCH + reload. Si tira, lo cazamos para no cerrar
  // el sheet con datos perdidos.
  onSave: (name: string) => Promise<void>;
};

export function EditRestaurantNameSheet({
  open,
  initialName,
  onClose,
  onSave,
}: Props) {
  const { t } = useI18n();
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(initialName);
      setSaving(false);
    }
  }, [open, initialName]);

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed || saving || trimmed === initialName) return;
    setSaving(true);
    try {
      await onSave(trimmed);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const dirty = name.trim() !== "" && name.trim() !== initialName;

  return (
    <BottomSheet open={open} onClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.body}>
          <Text style={styles.title}>{t("casa_edit_name_title")}</Text>
          <TextInput
            autoFocus
            value={name}
            onChangeText={setName}
            placeholder={t("casa_edit_name_placeholder")}
            placeholderTextColor={colors.mute}
            style={styles.input}
            maxLength={120}
            onSubmitEditing={handleSave}
            editable={!saving}
          />
          <View style={styles.actions}>
            <Pressable
              onPress={onClose}
              style={styles.btnGhost}
              disabled={saving}
            >
              <Text style={styles.btnGhostLabel}>{t("confirm_cancel")}</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={!dirty || saving}
              style={[
                styles.btnPrimary,
                (!dirty || saving) && styles.btnDisabled,
              ]}
            >
              <Text style={styles.btnPrimaryLabel}>
                {saving ? "…" : t("btn_save")}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
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
