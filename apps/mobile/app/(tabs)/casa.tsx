import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Screen } from "@/src/components/Screen";
import { useI18n } from "@/src/hooks/useI18n";
import { useMockUser, getMockRestaurant, getMockStaff } from "@/src/state/mockUser";
import { can } from "@atelier/shared";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

export default function CasaScreen() {
  const { t } = useI18n();
  const user = useMockUser();
  const restaurant = getMockRestaurant();
  const staff = getMockStaff();
  const showInviteCode = can(user.role, "view_invite_code");

  const roleLabel = {
    admin: t("role_admin"),
    chef_executive: t("role_chef_executive"),
    sous_chef: t("role_sous_chef"),
    viewer: t("role_viewer"),
  } as const;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heroRow}>
          <View style={styles.heroPhoto}>
            <Text style={styles.heroPhotoText}>{restaurant.initial}</Text>
          </View>
          <View style={styles.heroMeta}>
            <Text style={styles.eyebrow}>{t("eyebrow_casa")}</Text>
            <Text style={styles.restaurantName}>{restaurant.name}</Text>
            <Text style={styles.identity}>{restaurant.identityLine}</Text>
          </View>
        </View>

        {showInviteCode ? (
          <View style={styles.inviteRow}>
            <Text style={styles.eyebrow}>{t("eyebrow_codigo")}</Text>
            <Text style={styles.inviteCode}>{restaurant.inviteCode}</Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.eyebrow}>{t("eyebrow_staff")}</Text>
            <Text style={styles.count}>{staff.length}</Text>
          </View>
          {staff.map((s) => (
            <View key={s.id} style={styles.staffRow}>
              <View
                style={[
                  styles.staffAvatar,
                  s.role === "admin" && styles.staffAvatarAdmin,
                  s.role === "chef_executive" && styles.staffAvatarChef,
                ]}
              >
                <Text style={styles.staffAvatarText}>{s.initials}</Text>
              </View>
              <View style={styles.staffMeta}>
                <Text style={styles.staffName}>{s.name}</Text>
                <Text style={styles.staffRole}>{roleLabel[s.role]}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.xl,
  },
  heroRow: { flexDirection: "row", gap: spacing.lg, alignItems: "center" },
  heroPhoto: {
    width: 56,
    height: 56,
    borderRadius: radii.lg,
    backgroundColor: colors.teal,
    alignItems: "center",
    justifyContent: "center",
  },
  heroPhotoText: {
    color: colors.paper,
    fontFamily: fonts.serif,
    fontStyle: "italic",
    fontSize: fontSizes.serifLg,
  },
  heroMeta: { flex: 1, gap: 2 },
  eyebrow: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.eyebrow,
    color: colors.mute,
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },
  restaurantName: {
    fontFamily: fonts.serif,
    fontStyle: "italic",
    fontSize: fontSizes.serifLg,
    color: colors.ink,
  },
  identity: {
    fontFamily: fonts.serif,
    fontStyle: "italic",
    fontSize: fontSizes.bodySm,
    color: colors.inkSoft,
    lineHeight: fontSizes.bodySm * 1.5,
  },
  inviteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.paperSoft,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderWidth: 0.5,
    borderColor: colors.edge,
  },
  inviteCode: {
    fontFamily: fonts.mono,
    fontSize: fontSizes.body,
    color: colors.terracota,
    letterSpacing: 1.5,
  },
  section: { gap: spacing.sm },
  sectionHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  count: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.mute,
  },
  staffRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.edge,
  },
  staffAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.paperWarm,
    borderWidth: 1.5,
    borderColor: colors.edge,
    alignItems: "center",
    justifyContent: "center",
  },
  staffAvatarAdmin: { borderColor: colors.terracota },
  staffAvatarChef: { borderColor: colors.teal },
  staffAvatarText: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    fontWeight: "600",
    color: colors.ink,
  },
  staffMeta: { flex: 1, gap: 2 },
  staffName: { fontFamily: fonts.sans, fontSize: fontSizes.body, color: colors.ink },
  staffRole: { fontFamily: fonts.sans, fontSize: fontSizes.bodySm, color: colors.mute },
});
