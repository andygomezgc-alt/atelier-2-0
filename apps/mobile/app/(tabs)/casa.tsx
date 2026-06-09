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
import { useRouter } from "expo-router";
import { Screen } from "@/src/components/Screen";
import { ensureRestaurant } from "@/src/components/LazyRestaurantHost";
import { useI18n } from "@/src/hooks/useI18n";
import { useAuth } from "@/src/hooks/useAuth";
import { useRestaurant, type StaffMember } from "@/src/hooks/useRestaurant";
import { StaffMemberSheet } from "@/src/components/StaffMemberSheet";
import { EditRestaurantNameSheet } from "@/src/components/EditRestaurantNameSheet";
import { LeaveRestaurantSheet } from "@/src/components/LeaveRestaurantSheet";
import { showToast } from "@/src/components/Toast";
import { apiFetch } from "@/src/api/client";
import { can } from "@atelier/shared";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";
import type { Role } from "@atelier/shared";

export default function CasaScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const { state } = useAuth();
  const { rs, reload } = useRestaurant();
  const [selectedMember, setSelectedMember] = useState<StaffMember | null>(null);
  const [editNameOpen, setEditNameOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  // A-12 — el bloque del código de invitación se muestra colapsado por default
  // cuando el chef todavía cocina solo (staff.length === 1). Discreto sin
  // perder utilidad: tocás para expandir cuando querés invitar a alguien.
  const [inviteExpanded, setInviteExpanded] = useState(false);

  const user =
    state.status === "signed-in" || state.status === "needs-restaurant" ? state.user : null;
  const showInviteCode = user ? can(user.role, "view_invite_code") : false;
  const canManage = user ? can(user.role, "manage_members") : false;
  const canBanco = user ? can(user.role, "manage_products") : false;
  // F1 — solo admin puede editar el nombre del sitio.
  const canEditRestaurant = user ? can(user.role, "edit_restaurant") : false;

  // A-12 — si el chef todavía no tiene restaurante, Casa actúa de lobby.
  const needsRestaurant = state.status === "needs-restaurant" && !user?.restaurantId;

  // ⚠️ Regla de hooks: TODOS los useCallback / useMemo / useEffect tienen que
  // ir antes de CUALQUIER early return. En la primera versión de A-12
  // `handleCopyCode` quedó después del `if (needsRestaurant) return …`, lo
  // que rompía el conteo de hooks cuando el state pasaba de needs-restaurant
  // a signed-in tras el lazy-create ("Rendered more hooks than during the
  // previous render"). No mover esto debajo del early return otra vez.
  const handleCopyCode = useCallback(async () => {
    if (rs.status !== "ok") return;
    await Clipboard.setStringAsync(rs.data.inviteCode);
    showToast(t("toast_copiado"));
  }, [rs, t]);

  async function handleLobbyCreate() {
    // Reutiliza el mismo modal del lazy create; al confirmar el estado pasa a
    // signed-in y Casa re-renderiza la vista normal automáticamente.
    try {
      await ensureRestaurant();
    } catch {
      // cancelado por el usuario — se queda en el lobby
    }
  }

  if (needsRestaurant) {
    return (
      <Screen>
        <View style={styles.lobby}>
          <Text style={styles.mark}>
            <Text style={styles.markGlyph}>A</Text>telier
          </Text>
          <Text style={styles.lobbyTitle}>{t("casa_lobby_title")}</Text>
          <Text style={styles.lobbySub}>{t("casa_lobby_sub")}</Text>
          <View style={styles.lobbyActions}>
            <Pressable style={styles.lobbyPrimary} onPress={handleLobbyCreate}>
              <Text style={styles.lobbyPrimaryLabel}>
                {t("casa_lobby_btn_create")}
              </Text>
            </Pressable>
            <Pressable
              style={styles.lobbyGhost}
              onPress={() => router.push("/(auth)/join-with-code")}
            >
              <Text style={styles.lobbyGhostLabel}>{t("casa_lobby_btn_join")}</Text>
            </Pressable>
          </View>
        </View>
      </Screen>
    );
  }

  const roleLabel: Record<Role, string> = {
    admin: t("role_admin"),
    chef_executive: t("role_chef_executive"),
    sous_chef: t("role_sous_chef"),
    viewer: t("role_viewer"),
  };

  async function handleRegen() {
    try {
      await apiFetch("/api/restaurant/invite", { method: "POST" });
      reload();
      showToast(t("toast_regenerado"));
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("error_network"));
    }
  }

  async function handleSaveName(name: string) {
    try {
      await apiFetch("/api/restaurant", {
        method: "PATCH",
        body: JSON.stringify({ name }),
      });
      reload();
      showToast(t("toast_edit_mode"));
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("error_network"));
      throw err; // re-throw para que el sheet no cierre con el dato perdido
    }
  }

  async function handleShare() {
    if (rs.status !== "ok") return;
    try {
      await Share.share({
        message: t("casa_share_message", {
          restaurantName: rs.data.name,
          code: rs.data.inviteCode,
        }),
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
  // A-12 — staff = 1 significa "chef solo, todavía no invitó a nadie"; en ese
  // caso el bloque del código arranca colapsado para no robar protagonismo.
  const codeStartsCollapsed = restaurant.staff.length <= 1;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heroRow}>
          <View style={styles.heroPhoto}>
            <Text style={styles.heroPhotoText}>{restaurantInitial}</Text>
          </View>
          <View style={styles.heroMeta}>
            <Text style={styles.eyebrow}>{t("eyebrow_casa")}</Text>
            <View style={styles.nameRow}>
              <Text style={styles.restaurantName}>{restaurant.name}</Text>
              {canEditRestaurant ? (
                <Pressable
                  hitSlop={8}
                  onPress={() => setEditNameOpen(true)}
                  style={styles.editNameBtn}
                  accessibilityLabel={t("casa_edit_name_title")}
                >
                  <Ionicons name="pencil-outline" size={16} color={colors.terracota} />
                </Pressable>
              ) : null}
            </View>
            {restaurant.identityLine ? (
              <Text style={styles.identity}>{restaurant.identityLine}</Text>
            ) : null}
          </View>
        </View>

        {showInviteCode ? (
          codeStartsCollapsed && !inviteExpanded ? (
            // Discreto: chef solo. Muestra una sola línea "Invitar a alguien".
            <Pressable
              style={styles.inviteCollapsed}
              onPress={() => setInviteExpanded(true)}
            >
              <Ionicons name="person-add-outline" size={16} color={colors.terracota} />
              <Text style={styles.inviteCollapsedLabel}>
                {t("casa_invite_collapsed")}
              </Text>
              <Ionicons name="chevron-down" size={16} color={colors.mute} />
            </Pressable>
          ) : (
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
          )
        ) : null}

        {canBanco ? (
          <Pressable
            style={styles.bancoEntry}
            onPress={() =>
              // Cast a never: el typed-routes generator de Expo Router emite
              // "/productos/index" como path para el archivo index.tsx, pero
              // a runtime ese URL cae al dinámico [id] con id="index" y 404a.
              // El URL correcto para alcanzar index.tsx es "/productos".
              router.push("/productos" as never)
            }
          >
            <View style={styles.bancoIcon}>
              <Ionicons name="archive-outline" size={20} color={colors.terracota} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.bancoTitle}>{t("casa_banco_entry_title")}</Text>
              <Text style={styles.bancoSub}>{t("casa_banco_entry_sub")}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.mute} />
          </Pressable>
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

        {/* F3 — Salir del restaurante: cualquier miembro. El sheet decide
            qué variante mostrar según el preflight (A/B/C). */}
        <Pressable
          onPress={() => setLeaveOpen(true)}
          style={styles.leaveBtn}
          accessibilityLabel={t("casa_leave_btn")}
        >
          <Ionicons name="exit-outline" size={14} color={colors.danger} />
          <Text style={styles.leaveBtnLabel}>{t("casa_leave_btn")}</Text>
        </Pressable>
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

      <EditRestaurantNameSheet
        open={editNameOpen}
        initialName={restaurant.name}
        onClose={() => setEditNameOpen(false)}
        onSave={handleSaveName}
      />

      <LeaveRestaurantSheet
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
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
    fontFamily: fonts.serifItalic,
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
    fontFamily: fonts.serifItalic,
    fontSize: fontSizes.serifLg,
    color: colors.ink,
  },
  // F1 — row para nombre del restaurante + pencil de editar (solo admin).
  nameRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  editNameBtn: { padding: 4 },
  // F3 — botón "Salir del restaurante" al final de Casa. Ghost danger,
  // chico y discreto: es una acción rara, no debe robar protagonismo.
  leaveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    alignSelf: "center",
    marginTop: spacing.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  leaveBtnLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.danger,
    fontWeight: "600",
    letterSpacing: 0.4,
  },
  identity: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSizes.serifBodySm,
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
  inviteCollapsed: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  inviteCollapsedLabel: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.terracota,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  // A-12 — Lobby para needs-restaurant: Casa cumple la función que antes tenía
  // `(auth)/choose-flow`. Mismo tono editorial que la marca, pero adentro de la
  // app y sin gates bloqueantes.
  lobby: {
    flex: 1,
    paddingHorizontal: spacing.xxl,
    justifyContent: "center",
    gap: spacing.md,
  },
  mark: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSizes.serifDisplay + 16,
    color: colors.teal,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  markGlyph: { color: colors.terracota },
  lobbyTitle: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSizes.serifLg,
    color: colors.ink,
    textAlign: "center",
  },
  lobbySub: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.mute,
    textAlign: "center",
    lineHeight: fontSizes.bodySm * 1.5,
    marginBottom: spacing.xl,
  },
  lobbyActions: { gap: spacing.md },
  lobbyPrimary: {
    backgroundColor: colors.terracota,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  lobbyPrimaryLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.body,
    color: colors.paper,
    fontWeight: "600",
    letterSpacing: 1.2,
    textAlign: "center",
  },
  // Bloque 4 · C-03 — par primary/secondary tipo Menús (Editar terracota /
  // PDF teal): el ghost pasa a secondary solid tealSoft + label paper.
  lobbyGhost: {
    backgroundColor: colors.tealSoft,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  lobbyGhostLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.body,
    color: colors.paper,
    fontWeight: "600",
    letterSpacing: 1.2,
    textAlign: "center",
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
  bancoEntry: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.paperSoft,
    borderRadius: radii.md,
    borderWidth: 0.5,
    borderColor: colors.edge,
    padding: spacing.md,
  },
  bancoIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    // Bloque 4 · C-03 — tarjeta del banco usa tealSoft (afirmación pasiva)
    // en lugar de terracotaSoft (acción).
    backgroundColor: colors.tealSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  bancoTitle: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSizes.serifBody,
    color: colors.ink,
  },
  bancoSub: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.mute,
    marginTop: 2,
  },
});
