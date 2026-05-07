import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useI18n } from "@/src/hooks/useI18n";
import { apiFetch } from "@/src/api/client";
import { showToast } from "./Toast";
import { ConfirmSheet } from "./ConfirmSheet";
import { Button } from "./Button";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";
import type { Role } from "@atelier/shared";

type Member = {
  id: string;
  name: string;
  role: Role;
};

type Props = {
  open: boolean;
  member: Member | null;
  onClose: () => void;
  onChanged: () => void;
};

const ROLES: ReadonlyArray<{ id: Role; key: "role_admin" | "role_chef_executive" | "role_sous_chef" | "role_viewer" }> = [
  { id: "admin", key: "role_admin" },
  { id: "chef_executive", key: "role_chef_executive" },
  { id: "sous_chef", key: "role_sous_chef" },
  { id: "viewer", key: "role_viewer" },
];

export function StaffMemberSheet({ open, member, onClose, onChanged }: Props) {
  const { t } = useI18n();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!member) return null;

  async function handleRoleChange(role: Role) {
    if (!member || saving) return;
    setSaving(true);
    try {
      await apiFetch(`/api/restaurant/staff/${member.id}`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
      onChanged();
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("error_network"));
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    if (!member) return;
    setConfirmDelete(false);
    try {
      await apiFetch(`/api/restaurant/staff/${member.id}`, { method: "DELETE" });
      onChanged();
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("error_network"));
    }
  }

  const initials = member.name
    .split(" ")
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <>
      <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.hero}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
              <Text style={styles.name}>{member.name}</Text>
            </View>

            <Text style={styles.label}>{t("profile_role")}</Text>
            <View style={styles.roleList}>
              {ROLES.map((r) => (
                <Pressable
                  key={r.id}
                  style={[
                    styles.roleOption,
                    member.role === r.id && styles.roleOptionActive,
                  ]}
                  onPress={() => handleRoleChange(r.id)}
                  disabled={saving}
                >
                  <Text
                    style={[
                      styles.roleLabel,
                      member.role === r.id && styles.roleLabelActive,
                    ]}
                  >
                    {t(r.key)}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Button
              label={t("confirm_delete")}
              variant="danger"
              onPress={() => setConfirmDelete(true)}
              style={styles.removeBtn}
            />
          </ScrollView>
        </View>
      </Modal>

      <ConfirmSheet
        open={confirmDelete}
        title={`¿Eliminar a ${member.name}?`}
        body="Perderá acceso al restaurante. Puedes volver a invitarle con el código."
        confirmLabel={t("confirm_delete")}
        cancelLabel={t("confirm_cancel")}
        destructive
        onConfirm={handleRemove}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(20,17,15,0.4)" },
  sheet: {
    backgroundColor: colors.paperSoft,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "75%",
    paddingBottom: spacing.xl,
  },
  handle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.edge,
    marginTop: 10,
    marginBottom: spacing.sm,
  },
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, gap: spacing.lg },
  hero: { alignItems: "center", gap: spacing.sm },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.teal,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: colors.paper, fontFamily: fonts.sans, fontSize: 22, fontWeight: "600" },
  name: {
    fontFamily: fonts.serif,
    fontStyle: "italic",
    fontSize: fontSizes.serifLg,
    color: colors.ink,
  },
  label: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.eyebrow,
    color: colors.mute,
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },
  roleList: { gap: spacing.xs },
  roleOption: {
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 0.5,
    borderColor: colors.edge,
    backgroundColor: colors.paper,
  },
  roleOptionActive: { borderColor: colors.terracota, backgroundColor: colors.paperWarm },
  roleLabel: { fontFamily: fonts.sans, fontSize: fontSizes.body, color: colors.inkSoft },
  roleLabelActive: { color: colors.terracota, fontWeight: "600" },
  removeBtn: { marginTop: spacing.md },
});
