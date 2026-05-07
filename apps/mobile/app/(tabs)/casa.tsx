import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { Screen } from "@/src/components/Screen";
import { useI18n } from "@/src/hooks/useI18n";
import { useAuth } from "@/src/hooks/useAuth";
import { useRestaurant, type StaffMember } from "@/src/hooks/useRestaurant";
import { StaffMemberSheet } from "@/src/components/StaffMemberSheet";
import { showToast } from "@/src/components/Toast";
import { apiFetch } from "@/src/api/client";
import { can } from "@atelier/shared";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";
import type { Role } from "@atelier/shared";

export default function CasaScreen() {
  const { t } = useI18n();
  const { state } = useAuth();
  const { rs, reload } = useRestaurant();
  const [selectedMember, setSelectedMember] = useState<StaffMember | null>(null);

  const user =
    state.status === "signed-in" || state.status === "needs-restaurant" ? state.user : null;
  const showInviteCode = user ? can(user.role, "view_invite_code") : false;
  const canManage = user ? can(user.role, "manage_members") : false;

  const roleLabel: Record<Role, string> = {
    admin: t("role_admin"),
    chef_executive: t("role_chef_executive"),
    sous_chef: t("role_sous_chef"),
    viewer: t("role_viewer"),
  };

  const handleCopyCode = useCallback(async () => {
    if (rs.status !== "ok") return;
    await Clipboard.setStringAsync(rs.data.inviteCode);
    showToast(t("toast_copiado"));
  }, [rs, t]);

  async function handleRegen() {
    try {
      await apiFetch("/api/restaurant/invite", { method: "POST" });
      reload();
      showToast(t("toast_regenerado"));
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("error_network"));
    }
  }

  async function handleShare() {
    if (rs.status !== "ok") return;
    try {
      await Share.share({
        message: `Únete a ${rs.data.name} en Atelier con el código ${rs.data.inviteCode}.`,
      });
    } catch {
      // user cancelled
    }
  }

  if (rs.status === "loading") {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.terracota} />
        </View>
      </Screen>
    );
  }

  if (rs.status === "error") {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.errorText}>{rs.message}</Text>
        </View>
      </Screen>
    );
  }

  const restaurant = rs.data;
  const restaurantInitial = restaurant.name[0]?.toUpperCase() ?? "R";

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heroRow}>
          <View style={styles.heroPhoto}>
            <Text style={styles.heroPhotoText}>{restaurantInitial}</Text>
          </View>
          <View style={styles.heroMeta}>
            <Text style={styles.eyebrow}>{t("eyebrow_casa")}</Text>
            <Text style={styles.restaurantName}>{restaurant.name}</Text>
            {restaurant.identityLine ? (
              <Text style={styles.identity}>{restaurant.identityLine}</Text>
            ) : null}
          </View>
        </View>

        {showInviteCode ? (
          <View style={styles.inviteRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.eyebrow}>{t("eyebrow_codigo")}</Text>
              <Text style={styles.inviteCode}>{restaurant.inviteCode}</Text>
            </View>
            <Pressable hitSlop={8} onPress={handleCopyCode} style={styles.iconBtn}>
              <Ionicons name="copy-outline" size={18} color={colors.terracota} />
            </Pressable>
            <Pressable hitSlop={8} onPress={handleShare} style={styles.iconBtn}>
              <Ionicons name="share-outline" size={18} color={colors.terracota} />
            </Pressable>
            {canManage ? (
              <Pressable hitSlop={8} onPress={handleRegen} style={styles.iconBtn}>
                <Ionicons name="refresh-outline" size={18} color={colors.terracota} />
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.eyebrow}>{t("eyebrow_staff")}</Text>
            <Text style={styles.count}>{restaurant.staff.length}</Text>
          </View>
          {restaurant.staff.map((s) => {
            const si = s.name
              .split(" ")
              .map((w) => w[0] ?? "")
              .join("")
              .slice(0, 2)
              .toUpperCase();
            return (
              <Pressable
                key={s.id}
                style={styles.staffRow}
                onPress={() => canManage && setSelectedMember(s)}
                disabled={!canManage}
              >
                <View
                  style={[
                    styles.staffAvatar,
                    s.role === "admin" && styles.staffAvatarAdmin,
                    s.role === "chef_executive" && styles.staffAvatarChef,
                  ]}
                >
                  <Text style={styles.staffAvatarText}>{si}</Text>
                </View>
                <View style={styles.staffMeta}>
                  <Text style={styles.staffName}>{s.name}</Text>
                  <Text style={styles.staffRole}>{roleLabel[s.role]}</Text>
                </View>
                {canManage ? (
                  <Ionicons name="chevron-forward" size={16} color={colors.mute} />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <StaffMemberSheet
        open={!!selectedMember}
        member={selectedMember}
        onClose={() => setSelectedMember(null)}
        onChanged={() => {
          reload();
          showToast(t("toast_edit_mode"));
        }}
      />
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
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorText: { fontFamily: fonts.sans, fontSize: fontSizes.bodySm, color: colors.mute },
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
    gap: spacing.sm,
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
    marginTop: 2,
  },
  iconBtn: { padding: 4 },
  section: { gap: spacing.sm },
  sectionHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  count: { fontFamily: fonts.sans, fontSize: fontSizes.bodySm, color: colors.mute },
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
