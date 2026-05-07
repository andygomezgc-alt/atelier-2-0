// Bottom sheet rendered from any screen via the avatar in the header.
// Phase-0 surface: rol, restaurante, idioma, modelo, cerrar sesión.
// Wired to the Phase-0 mock state; Phase 1 swaps the mutators for
// real /api/me PATCH calls.

import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useI18n } from "@/src/hooks/useI18n";
import { useSession } from "@/src/hooks/useSession";
import {
  getMockRestaurant,
  setMockModel,
  setMockRole,
  useMockUser,
  type MockUser,
} from "@/src/state/mockUser";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";
import type { Language } from "@atelier/i18n";
import type { Role } from "@atelier/shared";

type Props = { open: boolean; onClose: () => void };

const LANGS: ReadonlyArray<Language> = ["es", "it", "en"];

export function ProfileSheet({ open, onClose }: Props) {
  const user = useMockUser();
  const restaurant = getMockRestaurant();
  const { t, lang, setLang } = useI18n();
  const { signOut } = useSession();

  const roleLabel: Record<Role, string> = {
    admin: t("role_admin"),
    chef_executive: t("role_chef_executive"),
    sous_chef: t("role_sous_chef"),
    viewer: t("role_viewer"),
  };

  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <ScrollView contentContainerStyle={styles.content}>
          <ProfileHero user={user} />

          <Row label={t("profile_role")} value={roleLabel[user.role]} />
          <Row label={t("profile_restaurant")} value={restaurant.name} />

          <Section label={t("profile_language")}>
            <View style={styles.pills}>
              {LANGS.map((l) => (
                <Pressable
                  key={l}
                  style={[styles.pill, lang === l && styles.pillActive]}
                  onPress={() => setLang(l)}
                >
                  <Text style={[styles.pillText, lang === l && styles.pillTextActive]}>{l}</Text>
                </Pressable>
              ))}
            </View>
          </Section>

          <Section label={t("profile_model")}>
            <ModelOption
              label="Sonnet 4.6 — rápido y robusto"
              active={user.defaultModel === "sonnet"}
              onPress={() => setMockModel("sonnet")}
            />
            <ModelOption
              label="Opus 4.7 — máxima profundidad"
              active={user.defaultModel === "opus"}
              onPress={() => setMockModel("opus")}
            />
          </Section>

          <Section label="Ver como (prototipo)">
            {(["admin", "chef_executive", "sous_chef", "viewer"] as const).map((r) => (
              <ModelOption
                key={r}
                label={roleLabel[r]}
                active={user.role === r}
                onPress={() => setMockRole(r)}
              />
            ))}
          </Section>

          <Pressable
            style={styles.dangerRow}
            onPress={() => {
              onClose();
              void signOut();
            }}
          >
            <Text style={styles.dangerLabel}>{t("profile_logout")}</Text>
            <Ionicons name="log-out-outline" size={18} color={colors.danger} />
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

function ProfileHero({ user }: { user: MockUser }) {
  return (
    <View style={styles.hero}>
      <View style={styles.heroPhoto}>
        <Text style={styles.heroPhotoText}>{user.initials}</Text>
      </View>
      <Text style={styles.heroName}>{user.name}</Text>
      <Text style={styles.heroEmail}>{user.email}</Text>
      <Text style={styles.heroBio}>"{user.bio}"</Text>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function ModelOption({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.modelOption, active && styles.modelOptionActive]}
      onPress={onPress}
    >
      <Text style={[styles.modelOptionText, active && styles.modelOptionTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(20,17,15,0.4)" },
  sheet: {
    backgroundColor: colors.paperSoft,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "85%",
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
  content: { padding: spacing.xl, gap: spacing.lg },
  hero: { alignItems: "center", paddingVertical: spacing.md, gap: 4 },
  heroPhoto: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.teal,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  heroPhotoText: {
    color: colors.paper,
    fontFamily: fonts.sans,
    fontSize: 24,
    fontWeight: "600",
  },
  heroName: {
    fontFamily: fonts.serif,
    fontStyle: "italic",
    fontSize: fontSizes.serifLg,
    color: colors.ink,
  },
  heroEmail: { fontFamily: fonts.sans, fontSize: fontSizes.bodySm, color: colors.mute },
  heroBio: {
    fontFamily: fonts.serif,
    fontStyle: "italic",
    fontSize: fontSizes.body,
    color: colors.inkSoft,
    textAlign: "center",
    marginTop: spacing.xs,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.md,
    borderTopWidth: 0.5,
    borderTopColor: colors.edge,
  },
  rowLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.eyebrow,
    color: colors.mute,
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },
  rowValue: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.body,
    color: colors.ink,
  },
  section: {
    paddingTop: spacing.md,
    borderTopWidth: 0.5,
    borderTopColor: colors.edge,
    gap: spacing.sm,
  },
  sectionBody: { gap: spacing.xs },
  pills: { flexDirection: "row", gap: spacing.xs, marginTop: spacing.xs },
  pill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    borderWidth: 0.5,
    borderColor: colors.edge,
    backgroundColor: colors.paper,
  },
  pillActive: { backgroundColor: colors.terracota, borderColor: colors.terracota },
  pillText: { fontFamily: fonts.sans, fontSize: fontSizes.bodySm, color: colors.ink },
  pillTextActive: { color: colors.paper, fontWeight: "600" },
  modelOption: {
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.paper,
    borderWidth: 0.5,
    borderColor: colors.edge,
  },
  modelOptionActive: { borderColor: colors.terracota, backgroundColor: colors.paperWarm },
  modelOptionText: { fontFamily: fonts.sans, fontSize: fontSizes.bodySm, color: colors.inkSoft },
  modelOptionTextActive: { color: colors.terracota, fontWeight: "600" },
  dangerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.md,
    borderTopWidth: 0.5,
    borderTopColor: colors.edge,
  },
  dangerLabel: { fontFamily: fonts.sans, fontSize: fontSizes.body, color: colors.danger },
});
