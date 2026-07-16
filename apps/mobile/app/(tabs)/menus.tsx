// Bloque 5 — Lista de menús "Composición de la carta" con secciones
// EN SERVICIO (tarjeta teal del menú con updatedAt más reciente con platos) y
// OTROS (cards normales). Sin etiquetas Activo/Archivado/Borrador — heurística
// updatedAt, no toca schema. Botón "+" arriba abre NewMenuSheet (reemplaza el
// input inline anterior).

import { memo, useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as SecureStore from "@/src/lib/secure-storage";
import { Screen } from "@/src/components/Screen";
import { Empty } from "@/src/components/Empty";
import { ConfirmSheet } from "@/src/components/ConfirmSheet";
import { SectionExplainer } from "@/src/components/SectionExplainer";
import { ensureRestaurant } from "@/src/components/LazyRestaurantHost";
import { NewMenuSheet } from "@/src/components/NewMenuSheet";
import { ExportPreviewSheet } from "@/src/components/ExportPreviewSheet";
import { useI18n } from "@/src/hooks/useI18n";
import { useAuth } from "@/src/hooks/useAuth";
import { useRefresh } from "@/src/hooks/useRefresh";
import { createMenu, listMenus, deleteMenu, getMenu, type Menu, type MenuFull } from "@/src/api/menus";
import { showToast } from "@/src/components/Toast";
import { TOKEN_KEY } from "@/src/api/client";
import { can } from "@atelier/shared";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

const API = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim();
  return cleaned || "menu";
}

export default function MenusScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const { state } = useAuth();

  const [menus, setMenus] = useState<Menu[]>([]);
  const [loading, setLoading] = useState(true);
  const [newSheetOpen, setNewSheetOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Menu | null>(null);
  // El botón PDF de la card abre la previsualización (no descarga directo).
  // La descarga vive dentro del ExportPreviewSheet, igual que cuando se
  // entra al menú vía EDITAR. `previewExporting` controla el spinner del
  // botón de descarga dentro del preview.
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewMenu, setPreviewMenu] = useState<MenuFull | null>(null);
  const [previewExporting, setPreviewExporting] = useState(false);

  const role =
    state.status === "signed-in" || state.status === "needs-restaurant"
      ? state.user.role
      : "viewer";
  const hasRestaurant =
    (state.status === "signed-in" || state.status === "needs-restaurant") &&
    Boolean(state.user.restaurantId);
  const canCreate = !hasRestaurant || can(role, "create_menu");
  const canDelete = can(role, "delete_menu");
  const canEdit = can(role, "edit_menu");

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setMenus(await listMenus());
    } catch {
      // keep
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const { refreshing, onRefresh } = useRefresh(["menus:list", "menus:trash"], reload);

  async function handleCreate(name: string) {
    try {
      // A-12: lazy create del sitio si todavía no hay restaurante.
      try {
        await ensureRestaurant();
      } catch {
        return;
      }
      const menu = await createMenu({ name });
      setMenus((prev) => [menu, ...prev]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("error_network"));
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setPendingDelete(null);
    const prev = menus;
    setMenus((m) => m.filter((x) => x.id !== id));
    try {
      await deleteMenu(id);
    } catch (err) {
      setMenus(prev);
      showToast(err instanceof Error ? err.message : t("error_network"));
    }
  }

  // Descarga el PDF y dispara share-sheet. Toma `{id, name}` para servir
  // tanto al Menu de la lista (legacy) como al MenuFull del preview (nuevo
  // flujo unificado). El botón de la card ya no llama esto directo — pasa
  // por el preview, y el preview llama `downloadAndShare` vía onDownload.
  async function downloadAndShare(menu: { id: string; name: string }) {
    try {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      const url = `${API}/api/menus/${menu.id}/pdf`;
      const fileUri = `${FileSystem.cacheDirectory}${encodeURIComponent(sanitizeFilename(menu.name))}.pdf`;
      const dl = await FileSystem.downloadAsync(url, fileUri, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (dl.status !== 200) throw new Error("Export failed");
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(dl.uri, { mimeType: "application/pdf" });
        showToast(t("toast_pdf_shared"));
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("error_network"));
    }
  }

  // Abre el ExportPreviewSheet con el detalle del menú. El detalle se
  // re-fetchea cada vez (no se cachea entre aperturas) para garantizar que
  // los alérgenos/iconos reflejen el estado actual.
  async function openPreview(m: Menu) {
    try {
      const detail = await getMenu(m.id);
      setPreviewMenu(detail);
      setPreviewOpen(true);
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("error_network"));
    }
  }

  // Reconciliation silenciosa cuando el sheet hace add/remove allergen
  // manual o toggle: re-fetch del detalle sin tocar `loading` (el sheet
  // queda montado y reactivo a la prop nueva).
  async function reloadPreview() {
    if (!previewMenu) return;
    try {
      setPreviewMenu(await getMenu(previewMenu.id));
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("error_network"));
    }
  }

  // Bloque 5 (segunda tanda) — estado "en servicio" real, controlado por el
  // chef desde el toggle del header. Varios menús pueden estar en servicio
  // simultáneamente (carta fija + degustación + …). La heurística updatedAt
  // que estaba acá fue reemplazada por el filtro real m.inService.
  const { inService, others } = useMemo(() => {
    return {
      inService: menus.filter((m) => m.inService),
      others: menus.filter((m) => !m.inService),
    };
  }, [menus]);

  const handleCardPress = useCallback(
    (id: string) => router.push({ pathname: "/menus/[id]", params: { id } }),
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: Menu }) => (
      <MenuCard
        item={item}
        canDelete={canDelete}
        onPress={handleCardPress}
        onDelete={(m) => setPendingDelete(m)}
        deleteLabel={t("confirm_delete")}
        dishesLabel={t("menu_eyebrow_dishes_only", { count: item.itemCount })}
      />
    ),
    [canDelete, handleCardPress, t],
  );
  const keyExtractor = useCallback((m: Menu) => m.id, []);

  const headerComponent = (
    <View>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerEyebrow}>
            {t("menus_header_eyebrow", { count: menus.length })}
          </Text>
          <Text style={styles.headerTitle}>{t("menus_header_title")}</Text>
        </View>
        {canCreate ? (
          <Pressable
            style={styles.plusBtn}
            onPress={() => setNewSheetOpen(true)}
            accessibilityLabel={t("menus_new_btn_label")}
          >
            <Ionicons name="add" size={20} color={colors.ink} />
          </Pressable>
        ) : null}
      </View>

      {inService.length > 0 ? (
        <View style={styles.inServiceWrap}>
          <Text style={styles.sectionEyebrow}>{t("menus_section_in_service")}</Text>
          {/* Bug-fix Bloque 5: las cards NO son Pressable (Pressable anidado
              dentro de Pressable rompía EDITAR/PDF). Bloque 5 segunda tanda:
              con varios menús en servicio simultáneo, la card se compacta —
              padding, serif y altura ajustados — para no ocupar toda la
              pantalla. Un solo menú = tarjeta grande del mockup. */}
          {inService.map((m) => {
            const compact = inService.length > 1;
            return (
              <View
                key={m.id}
                style={[styles.inServiceCard, compact && styles.inServiceCardCompact]}
              >
                <Text style={styles.inServiceSeason}>
                  {m.season
                    ? t("menu_eyebrow_season_dishes", {
                        season: m.season,
                        count: m.itemCount,
                      })
                    : t("menu_eyebrow_dishes_only", { count: m.itemCount })}
                </Text>
                <Text style={[styles.inServiceName, compact && styles.inServiceNameCompact]}>
                  {m.name}
                </Text>
                <View style={styles.inServiceActions}>
                  <Pressable style={styles.btnEdit} onPress={() => handleCardPress(m.id)}>
                    <Ionicons name="create-outline" size={14} color={colors.paper} />
                    <Text style={styles.btnEditLabel}>{t("menu_btn_edit")}</Text>
                  </Pressable>
                  <Pressable
                    style={styles.btnPdf}
                    onPress={() => void openPreview(m)}
                  >
                    <Ionicons name="document-text-outline" size={14} color={colors.paper} />
                    <Text style={styles.btnPdfLabel}>{t("menu_btn_pdf")}</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      {others.length > 0 ? (
        <Text style={[styles.sectionEyebrow, styles.othersEyebrow]}>
          {t("menus_section_others")}
        </Text>
      ) : null}
    </View>
  );

  return (
    <Screen
      right={
        canDelete ? (
          <Pressable
            onPress={() => router.push("/menus/papelera")}
            hitSlop={8}
            accessibilityLabel={t("papelera_title")}
          >
            <Ionicons name="trash-outline" size={20} color={colors.teal} />
          </Pressable>
        ) : undefined
      }
    >
      <SectionExplainer text={t("section_explainer_menus")} />
      <FlatList
        data={others}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={headerComponent}
        initialNumToRender={10}
        maxToRenderPerBatch={5}
        windowSize={11}
        removeClippedSubviews
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.terracota}
            colors={[colors.terracota]}
            progressBackgroundColor={colors.paper}
          />
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={colors.terracota} style={{ marginTop: spacing.xl }} />
          ) : inService.length === 0 ? (
            // Bug de lógica (auditoría jul 2026): antes `!inService`, pero
            // inService es un array — un array vacío es truthy, así que la guía
            // "crea tu primera carta" NUNCA aparecía. La FlatList ya solo muestra
            // este componente cuando `others` está vacío; falta chequear que
            // tampoco haya menús en servicio para mostrar el estado vacío real.
            <Empty icon="list-outline" title={t("empty_menus_title")} sub={t("empty_menus_sub")} />
          ) : null
        }
      />

      <NewMenuSheet
        open={newSheetOpen}
        onClose={() => setNewSheetOpen(false)}
        onCreate={handleCreate}
      />
      <ConfirmSheet
        open={!!pendingDelete}
        title={t("confirm_delete_menu_title")}
        body={t("confirm_delete_menu_body", { name: pendingDelete?.name ?? "" })}
        confirmLabel={t("confirm_delete")}
        cancelLabel={t("confirm_cancel")}
        destructive
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />

      {/* PDF unificado: el botón PDF de la card abre la previsualización
          (mismo componente que el del editor del menú). Iconos + leyenda +
          toggle + "+" funcionan igual. La descarga vive dentro del sheet,
          vía onDownload. previewMenu queda guardado entre aperturas — al
          cerrar el sheet el contenido se conserva hasta el próximo openPreview
          (que re-fetchea el detalle fresco). */}
      {previewMenu ? (
        <ExportPreviewSheet
          open={previewOpen}
          menu={previewMenu}
          exporting={previewExporting}
          canEdit={canEdit}
          onClose={() => setPreviewOpen(false)}
          onChanged={() => void reloadPreview()}
          onDownload={async () => {
            if (!previewMenu) return;
            setPreviewExporting(true);
            try {
              await downloadAndShare(previewMenu);
              setPreviewOpen(false);
            } finally {
              setPreviewExporting(false);
            }
          }}
        />
      ) : null}
    </Screen>
  );
}

// Card normal para la sección "OTROS". Sin etiquetas de estado (decisión
// visual: heurística sin schema).
const MenuCard = memo(function MenuCard({
  item,
  canDelete,
  onPress,
  onDelete,
  deleteLabel,
  dishesLabel,
}: {
  item: Menu;
  canDelete: boolean;
  onPress: (id: string) => void;
  onDelete: (m: Menu) => void;
  deleteLabel: string;
  dishesLabel: string;
}) {
  return (
    <Pressable style={styles.card} onPress={() => onPress(item.id)}>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={styles.cardTitle}>{item.name}</Text>
        <Text style={styles.cardMeta}>
          {item.season ? `${dishesLabel} · ${item.season}` : dishesLabel}
        </Text>
      </View>
      {canDelete ? (
        <Pressable
          hitSlop={10}
          onPress={() => onDelete(item)}
          accessibilityLabel={deleteLabel}
          style={styles.deleteBtn}
        >
          <Ionicons name="trash-outline" size={18} color={colors.mute} />
        </Pressable>
      ) : null}
      <Ionicons name="chevron-forward" size={18} color={colors.mute} />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  headerEyebrow: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.eyebrow,
    color: colors.mute,
    letterSpacing: 1.4,
  },
  headerTitle: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSizes.serifXl,
    color: colors.ink,
    lineHeight: fontSizes.serifXl * 1.15,
  },
  plusBtn: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    borderWidth: 0.5,
    borderColor: colors.edge,
    backgroundColor: colors.paper,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionEyebrow: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.eyebrow,
    color: colors.mute,
    letterSpacing: 1.4,
    marginBottom: spacing.sm,
  },
  othersEyebrow: {
    marginTop: spacing.lg,
  },
  inServiceWrap: {
    marginBottom: spacing.lg,
  },
  inServiceCard: {
    backgroundColor: colors.teal,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  // Bloque 5 segunda tanda — cuando hay varias cartas en servicio, cada una
  // se compacta: menos padding, tipografía un punto más chica, sin gap extra.
  inServiceCardCompact: {
    padding: spacing.md,
    gap: 2,
  },
  inServiceNameCompact: {
    fontSize: fontSizes.serifMd,
    marginBottom: spacing.xs,
  },
  inServiceSeason: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.eyebrow,
    color: colors.paperWarm,
    letterSpacing: 1.4,
    opacity: 0.85,
  },
  inServiceName: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSizes.serifLg,
    color: colors.paper,
    lineHeight: fontSizes.serifLg * 1.2,
    marginTop: 2,
    marginBottom: spacing.sm,
  },
  inServiceActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  btnEdit: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    backgroundColor: colors.terracota,
    borderRadius: radii.md,
    paddingVertical: spacing.sm + 2,
  },
  btnEditLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.paper,
    fontWeight: "600",
    letterSpacing: 1.2,
  },
  btnPdf: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    backgroundColor: colors.tealSoft,
    borderRadius: radii.md,
    paddingVertical: spacing.sm + 2,
  },
  btnPdfLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.paper,
    fontWeight: "600",
    letterSpacing: 1.2,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.paperSoft,
    borderRadius: radii.md,
    borderWidth: 0.5,
    borderColor: colors.edge,
    padding: spacing.md,
  },
  cardTitle: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSizes.serifBody,
    color: colors.ink,
  },
  cardMeta: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.mute,
    letterSpacing: 0.4,
  },
  deleteBtn: { padding: 4 },
});
