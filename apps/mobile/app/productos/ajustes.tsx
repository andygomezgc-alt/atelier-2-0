// Ajustes del banco — sub-paso 3 del rediseño.
//
// Acciones administrativas que antes vivían en la pantalla principal del
// banco. La idea es que el chef no las vea en su día a día — solo entra
// acá cuando necesita migrar recetas viejas o ver cómo va el recalc
// automático de criticidad.
//
// Acceso: ⚙ icon en el header de /productos.
//
// Permiso: gate por `edit_restaurant` (admin). Si un viewer/chef llega
// a la URL, se le muestra solo lectura (no debería pasar — el gear icon
// solo aparece para admin).

import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Screen } from "@/src/components/Screen";
import { useI18n } from "@/src/hooks/useI18n";
import { useAuth } from "@/src/hooks/useAuth";
import { showToast } from "@/src/components/Toast";
import {
  migrateLegacyRecipes,
  getRecalcStatus,
  getMigrationStatus,
  type RecalcStatus,
  type MigrationStatus,
} from "@/src/api/products";
import { can } from "@atelier/shared";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

// "hace X" formatter — i18n-aware, usa keys relative_*_ago. Mantengo
// granularidad simple: minutos / horas / días / semanas / meses. Más
// detalle no aporta para el caso de "último recalc".
function formatRelative(
  iso: string,
  t: ReturnType<typeof useI18n>["t"],
): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return t("relative_minutes_ago");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("relative_hours_ago", { n: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t("relative_days_ago", { n: days });
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return t("relative_weeks_ago", { n: weeks });
  return t("relative_months_ago");
}

export default function AjustesBancoScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const { state: authState } = useAuth();

  const role =
    authState.status === "signed-in" || authState.status === "needs-restaurant"
      ? authState.user.role
      : "viewer";
  const canManage = can(role, "edit_restaurant");

  const [recalcStatus, setRecalcStatus] = useState<RecalcStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [checking, setChecking] = useState(false);
  // Migration status: null mientras carga. Cuando carga, si pendingCount>0
  // mostramos la sección de migración; si =0, la ocultamos completa (no hay
  // nada que hacer; el chef no debería tropezarse con una acción inútil).
  const [migrationStatus, setMigrationStatus] = useState<MigrationStatus | null>(
    null,
  );

  useEffect(() => {
    void (async () => {
      try {
        const [recalc, migration] = await Promise.all([
          getRecalcStatus().catch(() => null),
          getMigrationStatus().catch(() => null),
        ]);
        if (recalc) setRecalcStatus(recalc);
        if (migration) setMigrationStatus(migration);
      } finally {
        setLoadingStatus(false);
      }
    })();
  }, []);

  const showMigration =
    canManage && migrationStatus !== null && migrationStatus.pendingCount > 0;

  // Migración legacy — mismo flow que tenía la lista principal: dry-run →
  // Alert con summary → confirm → apply → toast con resultado. Movido acá
  // para limpiar la lista principal.
  const handleMigrateLegacy = useCallback(async () => {
    if (checking) return;
    setChecking(true);
    try {
      const dryRun = await migrateLegacyRecipes("dry-run");
      const s = dryRun.summary;
      if (s.recipesToMigrate === 0) {
        showToast(t("migrate_nothing_to_do"));
        return;
      }
      // BP-01 — labels antes hardcoded en castellano. Ahora i18n con placeholders.
      Alert.alert(
        t("migrate_confirm_title"),
        `${t("migrate_dryrun_counts", { recipes: s.recipesToMigrate, ingredients: s.totalIngredients })}\n\n` +
          t("migrate_dryrun_matches", {
            exact: s.matches.exact,
            probable: s.matches.probable,
            none: s.matches.none,
          }),
        [
          { text: t("confirm_cancel"), style: "cancel" },
          {
            text: t("confirm_ok"),
            onPress: async () => {
              try {
                const applied = await migrateLegacyRecipes("apply");
                const r = applied.result;
                showToast(
                  t("migrate_done", {
                    recipes: r?.recipesMigrated ?? 0,
                    drafts: r?.draftsCreated ?? 0,
                  }),
                );
              } catch (err) {
                showToast(err instanceof Error ? err.message : t("error_network"));
              }
            },
          },
        ],
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("error_network"));
    } finally {
      setChecking(false);
    }
  }, [checking, t]);

  return (
    <Screen title={t("ajustes_title")} back onBack={() => router.back()}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* MIGRACIÓN — solo aparece si hay recetas legacy pendientes. Cuando
            no queda nada que migrar, ocultamos la sección entera (el chef no
            tiene que tropezarse con una acción inútil). */}
        {showMigration && migrationStatus && (
          <View style={styles.section}>
            <Text style={styles.eyebrow}>{t("ajustes_section_migration")}</Text>
            <Pressable
              style={styles.entry}
              onPress={handleMigrateLegacy}
              disabled={checking}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.entryTitle}>{t("btn_migrate_legacy")}</Text>
                <Text style={styles.entrySub}>
                  {t("ajustes_migrate_subtitle_with_count", {
                    n: migrationStatus.pendingCount,
                  })}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.mute} />
            </Pressable>
          </View>
        )}

        {/* CRITICIDAD — info, no acción. El cron lo ejecuta solo (sub-paso 4). */}
        <View style={styles.section}>
          <Text style={styles.eyebrow}>{t("ajustes_section_criticidad")}</Text>
          <Text style={styles.body}>{t("ajustes_criticidad_explanation")}</Text>
          {loadingStatus ? (
            <ActivityIndicator size="small" color={colors.terracota} style={{ alignSelf: "flex-start" }} />
          ) : recalcStatus && recalcStatus.lastRunAt ? (
            <Text style={styles.muted}>
              {t("ajustes_criticidad_last_run", {
                relative: formatRelative(recalcStatus.lastRunAt, t),
              })}
            </Text>
          ) : (
            <Text style={styles.muted}>{t("ajustes_criticidad_never_ran")}</Text>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.xl,
  },
  section: { gap: spacing.sm },
  eyebrow: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.eyebrow,
    color: colors.mute,
    textTransform: "uppercase",
    letterSpacing: 1.4,
    fontWeight: "600",
  },
  entry: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.paperSoft,
    borderRadius: radii.md,
    borderWidth: 0.5,
    borderColor: colors.edge,
    padding: spacing.md,
  },
  entryTitle: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSizes.serifBody,
    color: colors.ink,
  },
  entrySub: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.mute,
    marginTop: 2,
    lineHeight: fontSizes.caption * 1.5,
  },
  body: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.inkSoft,
    lineHeight: fontSizes.bodySm * 1.5,
  },
  muted: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.mute,
    fontStyle: "italic",
  },
});
