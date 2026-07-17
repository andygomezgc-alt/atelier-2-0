// Compositor de menús (vista staff).
//
// Optimizaciones (auditoría):
//  - DishCard y SectionHeader son componentes memo'd a nivel módulo: cada
//    keystroke en un input solo re-renderea su propia tarjeta, no toda la
//    lista. Esto saca el lag de #9.
//  - DebouncedTextInput hace save tras pausa + flush en unmount: si el chef
//    navega atrás antes de hacer blur, igual se persiste su último cambio
//    (#2).
//  - useMemo para sortedSections / bySection: las particiones se calculan
//    solo cuando cambian items/sections (#12).
//  - reorderMenuItems (transaccional) reemplaza el Promise.all (#4).
//  - sanitizeFilename mantiene acentos en el archivo PDF (#3).
//
// Bug #1: ahora cada DishCard tiene inputs editables para name y desc del
// plato (staff-only); pegan a MenuItem.customName/customDesc, que es lo
// canónico para cocina. La vista cliente sigue independiente vía overrides.

import { memo, useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  LayoutAnimation,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
} from "react-native";

// Android opt-in para LayoutAnimation. iOS by default.
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import * as Sharing from "expo-sharing";
import * as SecureStore from "@/src/lib/secure-storage";
import { Screen } from "@/src/components/Screen";
import { Eyebrow } from "@/src/components/Eyebrow";
import { Button } from "@/src/components/Button";
import { NetworkError } from "@/src/components/NetworkError";
import { DebouncedTextInput } from "@/src/components/DebouncedTextInput";
import { useI18n } from "@/src/hooks/useI18n";
import { useAuth } from "@/src/hooks/useAuth";
import { useRefresh } from "@/src/hooks/useRefresh";
import {
  getMenu,
  patchMenu,
  duplicateMenu,
  patchMenuItem,
  deleteMenuItem,
  addMenuItem,
  reorderMenuItems,
  createSection,
  patchSection,
  deleteSection,
  uploadMenuStyleFile,
  type MenuFull,
} from "@/src/api/menus";
import { showToast } from "@/src/components/Toast";
import { ExportPreviewSheet } from "@/src/components/ExportPreviewSheet";
import { ConfirmSheet } from "@/src/components/ConfirmSheet";
import { SectionPickerSheet } from "@/src/components/SectionPickerSheet";
import { SectionPresetSheet } from "@/src/components/SectionPresetSheet";
import { RecipeBankPickerSheet } from "@/src/components/RecipeBankPickerSheet";
import { StylePreviewSheet } from "@/src/components/StylePreviewSheet";
import { TOKEN_KEY } from "@/src/api/client";
import { can, type MenuStyle, type MenuStyleSpec } from "@atelier/shared";
import { useKeyboardHeight } from "@/src/lib/keyboard";
import { apiErrorMessage } from "@/src/lib/api-error";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

const API = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

const STYLES: ReadonlyArray<{
  id: MenuStyle;
  labelKey: "style_elegant" | "style_rustic" | "style_minimal" | "style_custom";
}> = [
  { id: "elegant", labelKey: "style_elegant" },
  { id: "rustic", labelKey: "style_rustic" },
  { id: "minimal", labelKey: "style_minimal" },
  { id: "custom", labelKey: "style_custom" },
];

function formatPrice(cents: number): string {
  return (cents / 100).toFixed(0);
}

function centsFromInput(raw: string): number {
  const cleaned = raw.replace(/[^0-9.,]/g, "").replace(",", ".");
  const n = parseFloat(cleaned || "0");
  return Math.max(0, Math.round(n * 100));
}

/**
 * Limpia solo los caracteres ilegales en filesystems mainstream
 * (Windows/macOS/Linux). Preserva acentos, ñ, espacios, etc. — el resultado
 * es legible cuando el chef comparte el PDF desde mobile.
 */
function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim();
  return cleaned || "menu";
}

type MenuItem = MenuFull["items"][number];
type MenuSection = MenuFull["sections"][number];

// ───────────────────────── SectionHeader ─────────────────────────

type SectionHeaderProps = {
  section: MenuSection;
  index: number; // 1-based para el eyebrow "{n} · CATEGORÍA"
  count: number;
  isCollapsed: boolean;
  canEdit: boolean;
  placeholder: string;
  eyebrowLabel: string; // "{n} · CATEGORÍA" ya formateado por el padre
  dishesLabel: string; // "{count} platos" ya formateado
  onToggle: (id: string) => void;
  onSaveName: (id: string, value: string) => void;
  onDelete: (id: string, name: string) => void;
};

const SectionHeader = memo(function SectionHeader({
  section,
  index: _index,
  count: _count,
  isCollapsed,
  canEdit,
  placeholder,
  eyebrowLabel,
  dishesLabel,
  onToggle,
  onSaveName,
  onDelete,
}: SectionHeaderProps) {
  const handleSave = useCallback(
    (v: string) => onSaveName(section.id, v),
    [onSaveName, section.id],
  );
  return (
    <View>
      <View style={styles.sectionTopRow}>
        <Text style={styles.sectionEyebrowSmall}>{eyebrowLabel}</Text>
        <Text style={styles.sectionDishesCount}>{dishesLabel}</Text>
      </View>
      <View style={styles.sectionNameRow}>
        <Pressable
          onPress={() => onToggle(section.id)}
          hitSlop={6}
          style={styles.collapseToggle}
        >
          <Ionicons
            name={isCollapsed ? "chevron-forward" : "chevron-down"}
            size={14}
            color={colors.terracota}
          />
        </Pressable>
        <DebouncedTextInput
          value={section.name}
          onSave={handleSave}
          editable={canEdit}
          placeholder={placeholder}
          style={styles.sectionNameInput}
          maxLength={120}
        />
        {canEdit ? (
          <Pressable hitSlop={10} onPress={() => onDelete(section.id, section.name)}>
            <Ionicons name="trash-outline" size={16} color={colors.mute} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
});

// ───────────────────────── DishCard ─────────────────────────

type DishCardProps = {
  dish: MenuItem;
  sectionLabel: string;
  canEdit: boolean;
  canViewStaffRecipe: boolean;
  isFirst: boolean;
  isLast: boolean;
  isDeleting: boolean;
  isReordering: boolean;
  namePlaceholder: string;
  descPlaceholder: string;
  viewRecipeLabel: string;
  clearCustomNameLabel: string;
  fromRecipeBookLabel: string; // Bloque 5 — eyebrow "DESDE RECETARIO"
  onSaveName: (itemId: string, value: string) => void;
  onSaveDesc: (itemId: string, value: string) => void;
  onSavePrice: (itemId: string, value: string) => void;
  onClearCustomName: (itemId: string) => void;
  onOpenSectionPicker: (itemId: string) => void;
  onReorder: (itemId: string, dir: "up" | "down") => void;
  onDelete: (itemId: string, name: string) => void;
  onViewRecipe: (recipeId: string) => void;
};

const DishCard = memo(function DishCard({
  dish,
  sectionLabel,
  canEdit,
  canViewStaffRecipe,
  isFirst,
  isLast,
  isDeleting,
  isReordering,
  namePlaceholder,
  descPlaceholder,
  viewRecipeLabel,
  clearCustomNameLabel,
  fromRecipeBookLabel,
  onSaveName,
  onSaveDesc,
  onSavePrice,
  onClearCustomName,
  onOpenSectionPicker,
  onReorder,
  onDelete,
  onViewRecipe,
}: DishCardProps) {
  const handleSaveName = useCallback((v: string) => onSaveName(dish.id, v), [onSaveName, dish.id]);
  const handleSaveDesc = useCallback((v: string) => onSaveDesc(dish.id, v), [onSaveDesc, dish.id]);
  const handleSavePrice = useCallback((v: string) => onSavePrice(dish.id, v), [onSavePrice, dish.id]);
  const hasCustomName = !!dish.customName && dish.customName.trim() !== "";
  return (
    <View style={styles.dishCard}>
      <View style={styles.dishTopRow}>
        {canEdit ? (
          <View style={styles.reorderBox}>
            <Pressable
              hitSlop={6}
              disabled={isFirst || isReordering}
              onPress={() => onReorder(dish.id, "up")}
            >
              <Ionicons
                name="chevron-up"
                size={14}
                color={isFirst || isReordering ? colors.edge : colors.mute}
              />
            </Pressable>
            <Pressable
              hitSlop={6}
              disabled={isLast || isReordering}
              onPress={() => onReorder(dish.id, "down")}
            >
              <Ionicons
                name="chevron-down"
                size={14}
                color={isLast || isReordering ? colors.edge : colors.mute}
              />
            </Pressable>
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <DebouncedTextInput
            value={dish.name}
            onSave={handleSaveName}
            editable={canEdit}
            placeholder={namePlaceholder}
            style={styles.dishName}
            multiline
            maxLength={200}
          />
          {/* Bloque 5 — eyebrow "DESDE RECETARIO" debajo del nombre, como en el mockup */}
          <Text style={styles.fromRecipeBookEyebrow}>{fromRecipeBookLabel}</Text>
          {canEdit && hasCustomName ? (
            <Pressable
              style={styles.customNameBadge}
              hitSlop={6}
              onPress={() => onClearCustomName(dish.id)}
              accessibilityLabel={clearCustomNameLabel}
            >
              <Ionicons name="close-circle-outline" size={11} color={colors.terracota} />
              <Text style={styles.customNameBadgeLabel}>{clearCustomNameLabel}</Text>
            </Pressable>
          ) : null}
          <DebouncedTextInput
            value={dish.description}
            onSave={handleSaveDesc}
            editable={canEdit}
            placeholder={descPlaceholder}
            style={styles.dishDesc}
            multiline
            maxLength={1000}
          />
        </View>

        <View style={styles.priceBox}>
          <DebouncedTextInput
            value={formatPrice(dish.price)}
            onSave={handleSavePrice}
            editable={canEdit}
            keyboardType="numeric"
            style={styles.priceInput}
            maxLength={10}
          />
          <Text style={styles.priceUnit}>€</Text>
        </View>
      </View>

      <View style={styles.dishActions}>
        <View style={styles.dishActionsLeft}>
          {canEdit ? (
            <Pressable
              style={styles.sectionChip}
              onPress={() => onOpenSectionPicker(dish.id)}
            >
              <Ionicons name="folder-outline" size={12} color={colors.terracota} />
              <Text style={styles.sectionChipLabel}>{sectionLabel}</Text>
            </Pressable>
          ) : null}
          {canViewStaffRecipe ? (
            <Pressable onPress={() => onViewRecipe(dish.recipeId)}>
              <Text style={styles.linkLabel}>{viewRecipeLabel}</Text>
            </Pressable>
          ) : null}
        </View>
        {canEdit ? (
          <Pressable
            hitSlop={10}
            disabled={isDeleting}
            onPress={() => onDelete(dish.id, dish.name)}
          >
            <Ionicons name="trash-outline" size={16} color={isDeleting ? colors.edge : colors.mute} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
});

// ───────────────────────── Pantalla ─────────────────────────

export default function MenuDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useI18n();
  const { state: authState } = useAuth();
  const router = useRouter();
  const kb = useKeyboardHeight();

  const [menu, setMenu] = useState<MenuFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [togglingInService, setTogglingInService] = useState(false);
  const togglingInServiceRef = useRef(false);
  const [exporting, setExporting] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pendingDeleteItem, setPendingDeleteItem] = useState<{ id: string; name: string } | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const deletingItemIdRef = useRef<string | null>(null);
  const [reorderingItemId, setReorderingItemId] = useState<string | null>(null);
  const reorderingItemIdRef = useRef<string | null>(null);
  const [pendingDeleteSection, setPendingDeleteSection] = useState<{ id: string; name: string } | null>(null);
  const [deletingSection, setDeletingSection] = useState(false);
  const [sectionPickerForItem, setSectionPickerForItem] = useState<string | null>(null);
  const [addSectionOpen, setAddSectionOpen] = useState(false);
  const [bankPickerForSection, setBankPickerForSection] = useState<string | null>(null);
  const [bankPickerForUnsectioned, setBankPickerForUnsectioned] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  // "Tu estilo" — spinner mientras se sube la foto de la carta real.
  const [styleUploading, setStyleUploading] = useState(false);
  // "Tu estilo" — spec a previsualizar en el sheet "Así quedó tu estilo".
  // Se llena tras una extracción exitosa, o al reabrir el chip custom activo.
  const [stylePreview, setStylePreview] = useState<MenuStyleSpec | null>(null);

  const role =
    authState.status === "signed-in" || authState.status === "needs-restaurant"
      ? authState.user.role
      : "viewer";
  const canEdit = can(role, "edit_menu");
  const canExport = can(role, "export_pdf");
  const canViewStaffRecipe = can(role, "view_staff_recipe");

  // Si se llama con { silent: true }, el reload no toca `loading` —
  // sirve para refrescos puntuales (ej. agregar/quitar alérgeno manual desde
  // el "+" en la preview) donde mostrar spinner desmontaría el ExportPreviewSheet
  // y el Modal nativo de RN re-monta feo. El silent mantiene el sheet abierto
  // y reconcilia el cambio de menu por reactividad de prop.
  const reload = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!id) return;
      if (!opts?.silent) setLoading(true);
      setLoadError(false);
      try {
        setMenu(await getMenu(id));
        setLoadError(false);
      } catch (err) {
        setLoadError(true);
        showToast(err instanceof Error ? err.message : t("error_network"));
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [id, t],
  );

  // useFocusEffect (no useEffect): faltaba refetchear al volver de otra
  // pantalla (ej. tras editar una receta que este menú embebe) — mismo
  // patrón que recetas/[id].tsx.
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  // El pull-to-refresh recarga en silencio (reload ya soportaba el modo):
  // su única señal visual es el spinner del gesto, no el spinner full-screen
  // que desmontaría el ScrollView.
  const silentReload = useCallback(() => reload({ silent: true }), [reload]);
  const refreshPrefixes = id ? [`menus:detail:${id}`] : [];
  const { refreshing, onRefresh } = useRefresh(refreshPrefixes, silentReload);

  // Duplicar el menú entero como copia (variante de carta) y abrir la copia.
  async function handleDuplicateMenu() {
    if (!menu || duplicating) return;
    setDuplicating(true);
    try {
      const copy = await duplicateMenu(menu.id);
      showToast(t("toast_menu_duplicated"));
      router.replace({ pathname: "/menus/[id]", params: { id: copy.id } });
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("error_network"));
    } finally {
      setDuplicating(false);
    }
  }

  // ───────── Handlers (stable refs para que los memo'd hijos no re-rendereen) ─────────

  // Devuelve un Promise<boolean> — true en éxito, false si falla (ya avisado
  // por toast + reload). handleStyleCaptureUri lo usa para saber si la
  // activación del estilo custom salió bien antes de abrir la preview.
  const handleStyleChange = useCallback(
    async (style: MenuStyle): Promise<boolean> => {
      setMenu((m) => (m ? { ...m, presentationStyle: style } : m));
      try {
        await patchMenu(id, { presentationStyle: style });
        return true;
      } catch {
        showToast(t("error_network"));
        void reload();
        return false;
      }
    },
    [id, t, reload],
  );

  // "Tu estilo" — sube la foto ya elegida/tomada. `activateStyle` solo aplica
  // en la primera captura (todavía no hay hasCustomStyle): en la re-captura
  // el menú ya está en "custom", así que solo hace falta refrescar + avisar.
  // Éxito con spec en mano → abre el sheet de preview en vez del toast de
  // siempre (el toast queda como fallback si no hay spec o falló la activación).
  const handleStyleCaptureUri = useCallback(
    async (uri: string, mime: string, activateStyle: boolean) => {
      setStyleUploading(true);
      try {
        const spec = await uploadMenuStyleFile(uri, mime);
        const activated = activateStyle ? await handleStyleChange("custom") : true;
        await reload({ silent: true });
        if (spec && activated) {
          setStylePreview(spec);
        } else {
          showToast(t("toast_menu_style_created"));
        }
      } catch (err) {
        showToast(apiErrorMessage(err, t));
      } finally {
        setStyleUploading(false);
      }
    },
    [handleStyleChange, reload, t],
  );

  const handleCaptureStylePhoto = useCallback(
    async (activateStyle: boolean) => {
      if (styleUploading) return;
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        showToast(t("cargar_permiso_camara"));
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.6 });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) return;
      await handleStyleCaptureUri(asset.uri, "image/jpeg", activateStyle);
    },
    [styleUploading, t, handleStyleCaptureUri],
  );

  const handlePickStyleFromGallery = useCallback(
    async (activateStyle: boolean) => {
      if (styleUploading) return;
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        showToast(t("cargar_permiso_galeria"));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.6 });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) return;
      await handleStyleCaptureUri(asset.uri, "image/jpeg", activateStyle);
    },
    [styleUploading, t, handleStyleCaptureUri],
  );

  // PDF de la carta: sin permisos runtime (el document picker no los necesita).
  const handlePickStylePdf = useCallback(
    async (activateStyle: boolean) => {
      if (styleUploading) return;
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) return;
      await handleStyleCaptureUri(asset.uri, "application/pdf", activateStyle);
    },
    [styleUploading, handleStyleCaptureUri],
  );

  // Punto de entrada del flujo: ofrece cámara/galería/PDF y, antes de abrir el
  // picker, muestra el hint de qué hace la IA con la carta.
  // Android limita Alert a 3 botones: se omite "Cancelar" (cancelable: true
  // permite cerrar tocando fuera); iOS conserva los 4 botones.
  const handleStartStyleCapture = useCallback(
    (activateStyle: boolean) => {
      if (styleUploading) return;
      const buttons =
        Platform.OS === "android"
          ? [
              { text: t("cargar_foto"), onPress: () => void handleCaptureStylePhoto(activateStyle) },
              { text: t("cargar_galeria"), onPress: () => void handlePickStyleFromGallery(activateStyle) },
              { text: t("menu_style_pdf"), onPress: () => void handlePickStylePdf(activateStyle) },
            ]
          : [
              { text: t("cargar_foto"), onPress: () => void handleCaptureStylePhoto(activateStyle) },
              { text: t("cargar_galeria"), onPress: () => void handlePickStyleFromGallery(activateStyle) },
              { text: t("menu_style_pdf"), onPress: () => void handlePickStylePdf(activateStyle) },
              { text: t("confirm_cancel"), style: "cancel" as const },
            ];
      Alert.alert(t("style_custom"), t("menu_style_hint"), buttons, { cancelable: true });
    },
    [
      styleUploading,
      t,
      handleCaptureStylePhoto,
      handlePickStyleFromGallery,
      handlePickStylePdf,
    ],
  );

  // Bloque 5 (segunda tanda) — toggle "en servicio". Optimistic update +
  // revert al error. Mismo patrón que handleStyleChange.
  const handleToggleInService = useCallback(async () => {
    if (!menu || togglingInServiceRef.current) return;
    togglingInServiceRef.current = true;
    setTogglingInService(true);
    const next = !menu.inService;
    setMenu((m) => (m ? { ...m, inService: next } : m));
    try {
      const updated = await patchMenu(menu.id, { inService: next });
      setMenu(updated);
    } catch {
      showToast(t("error_network"));
      void reload();
    } finally {
      togglingInServiceRef.current = false;
      setTogglingInService(false);
    }
  }, [menu, t, reload]);

  const handleSaveItemName = useCallback(
    async (itemId: string, value: string) => {
      if (!menu) return;
      // Optimistic update — el customName puede ser null si queda vacío,
      // entonces el fallback a recipe.title vuelve a actuar.
      const cleaned = value.trim();
      setMenu((m) =>
        m
          ? { ...m, items: m.items.map((it) => (it.id === itemId ? { ...it, name: cleaned || it.name } : it)) }
          : m,
      );
      try {
        await patchMenuItem(menu.id, itemId, { customName: cleaned || null });
      } catch {
        showToast(t("error_network"));
        void reload();
      }
    },
    [menu, t, reload],
  );

  const handleSaveItemDesc = useCallback(
    async (itemId: string, value: string) => {
      if (!menu) return;
      const cleaned = value.trim();
      setMenu((m) =>
        m
          ? { ...m, items: m.items.map((it) => (it.id === itemId ? { ...it, description: cleaned } : it)) }
          : m,
      );
      try {
        await patchMenuItem(menu.id, itemId, { customDesc: cleaned || null });
      } catch {
        showToast(t("error_network"));
        void reload();
      }
    },
    [menu, t, reload],
  );

  const handleSaveItemPrice = useCallback(
    async (itemId: string, value: string) => {
      if (!menu) return;
      const cents = centsFromInput(value);
      setMenu((m) =>
        m
          ? { ...m, items: m.items.map((it) => (it.id === itemId ? { ...it, price: cents } : it)) }
          : m,
      );
      try {
        await patchMenuItem(menu.id, itemId, { price: cents });
      } catch {
        showToast(t("error_network"));
        void reload();
      }
    },
    [menu, t, reload],
  );

  const handleConfirmDeleteItem = useCallback(
    async () => {
      if (!menu || !pendingDeleteItem || deletingItemIdRef.current) return;
      const itemId = pendingDeleteItem.id;
      deletingItemIdRef.current = itemId;
      setDeletingItemId(itemId);
      try {
        await deleteMenuItem(menu.id, itemId);
        setMenu((m) => (m ? { ...m, items: m.items.filter((it) => it.id !== itemId) } : m));
        setPendingDeleteItem(null);
      } catch {
        showToast(t("error_network"));
        void reload();
      } finally {
        deletingItemIdRef.current = null;
        setDeletingItemId(null);
      }
    },
    [menu, pendingDeleteItem, t, reload],
  );

  const handleOpenDeleteItem = useCallback((itemId: string, name: string) => {
    if (deletingItemIdRef.current) return;
    setPendingDeleteItem({ id: itemId, name });
  }, []);

  const handleClearCustomName = useCallback(
    async (itemId: string) => {
      if (!menu) return;
      try {
        const updated = await patchMenuItem(menu.id, itemId, { customName: null });
        setMenu(updated);
      } catch {
        showToast(t("error_network"));
        void reload();
      }
    },
    [menu, t, reload],
  );

  const handleAddSection = useCallback(
    async (name: string) => {
      if (!menu) return;
      try {
        const updated = await createSection(menu.id, { name });
        setMenu(updated);
      } catch (err) {
        showToast(err instanceof Error ? err.message : t("error_network"));
      }
    },
    [menu, t],
  );

  const handleSaveSectionName = useCallback(
    async (sectionId: string, name: string) => {
      if (!menu) return;
      const cleaned = name.trim();
      if (!cleaned) return;
      try {
        const updated = await patchSection(menu.id, sectionId, { name: cleaned });
        setMenu(updated);
      } catch (err) {
        showToast(err instanceof Error ? err.message : t("error_network"));
      }
    },
    [menu, t],
  );

  // Bug #6: el modal queda abierto hasta que el delete confirma. Si falla,
  // mostramos toast y dejamos al usuario reintentar o cancelar.
  const handleConfirmDeleteSection = useCallback(async () => {
    if (!menu || !pendingDeleteSection || deletingSection) return;
    setDeletingSection(true);
    try {
      const updated = await deleteSection(menu.id, pendingDeleteSection.id);
      setMenu(updated);
      setPendingDeleteSection(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("error_network"));
    } finally {
      setDeletingSection(false);
    }
  }, [menu, pendingDeleteSection, deletingSection, t]);

  const handleOpenDeleteSection = useCallback((sectionId: string, name: string) => {
    setPendingDeleteSection({ id: sectionId, name });
  }, []);

  const handleAddDishFromBank = useCallback(
    async (sectionId: string | null, recipeId: string) => {
      if (!menu) return;
      try {
        const updated = await addMenuItem(menu.id, {
          recipeId,
          sectionId,
          price: 2800, // 28 € default; el chef edita inline después
        });
        setMenu(updated);
      } catch (err) {
        showToast(err instanceof Error ? err.message : t("error_network"));
      }
    },
    [menu, t],
  );

  // Bug #4: ahora un solo POST transaccional. El server hace $transaction.
  const handleReorderItem = useCallback(
    async (itemId: string, direction: "up" | "down") => {
      if (!menu || reorderingItemIdRef.current) return;
      const item = menu.items.find((it) => it.id === itemId);
      if (!item) return;
      const siblings = menu.items
        .filter((it) => (it.sectionId ?? null) === (item.sectionId ?? null))
        .sort((a, b) => a.order - b.order);
      const idx = siblings.findIndex((it) => it.id === itemId);
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      const target = siblings[swapIdx];
      if (!target) return;
      reorderingItemIdRef.current = itemId;
      setReorderingItemId(itemId);
      // Optimistic UI primero
      setMenu((m) =>
        m
          ? {
              ...m,
              items: m.items.map((it) =>
                it.id === item.id
                  ? { ...it, order: target.order }
                  : it.id === target.id
                    ? { ...it, order: item.order }
                    : it,
              ),
            }
          : m,
      );
      try {
        const updated = await reorderMenuItems(menu.id, item.id, target.id);
        setMenu(updated);
      } catch {
        showToast(t("error_network"));
        void reload();
      } finally {
        reorderingItemIdRef.current = null;
        setReorderingItemId(null);
      }
    },
    [menu, t, reload],
  );

  const handleMoveItem = useCallback(
    async (itemId: string, sectionId: string | null) => {
      if (!menu) return;
      setMenu((m) =>
        m
          ? { ...m, items: m.items.map((it) => (it.id === itemId ? { ...it, sectionId } : it)) }
          : m,
      );
      try {
        const updated = await patchMenuItem(menu.id, itemId, { sectionId });
        setMenu(updated);
      } catch {
        showToast(t("error_network"));
        void reload();
      }
    },
    [menu, t, reload],
  );

  const handleOpenSectionPickerForItem = useCallback((itemId: string) => {
    setSectionPickerForItem(itemId);
  }, []);

  const handleOpenBankForSection = useCallback((sectionId: string) => {
    setBankPickerForSection(sectionId);
  }, []);

  const toggleSection = useCallback((sectionId: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCollapsed((prev) => ({ ...prev, [sectionId]: !prev[sectionId] }));
  }, []);

  const handleViewRecipe = useCallback(
    (recipeId: string) => router.push({ pathname: "/recetas/[id]", params: { id: recipeId } }),
    [router],
  );

  // Bug #3: filename preserva acentos / ñ.
  // styleOverride — el sheet de preview de "Tu estilo" fuerza "custom" al
  // pedir el PDF real, sin depender de que el menú ya haya cambiado de estilo.
  const exportPdf = useCallback(async (styleOverride?: MenuStyle) => {
    if (!menu || exporting) return;
    setExporting(true);
    try {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      const url = `${API}/api/menus/${menu.id}/pdf?style=${styleOverride ?? menu.presentationStyle}`;
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
    } finally {
      setExporting(false);
    }
  }, [menu, exporting, t]);

  // ───────── Memoizados ─────────

  const partition = useMemo(() => {
    if (!menu) return { sections: [], unsectioned: [] as MenuItem[] };
    const sortedSections = [...(menu.sections ?? [])].sort((a, b) => a.order - b.order);
    const bySection = new Map<string | null, MenuItem[]>();
    for (const it of menu.items) {
      const key = it.sectionId ?? null;
      const list = bySection.get(key) ?? [];
      list.push(it);
      bySection.set(key, list);
    }
    const sectionsWithItems = sortedSections.map((sec) => ({
      section: sec,
      items: (bySection.get(sec.id) ?? []).sort((a, b) => a.order - b.order),
    }));
    const unsectioned = (bySection.get(null) ?? []).sort((a, b) => a.order - b.order);
    return { sections: sectionsWithItems, unsectioned };
  }, [menu]);

  // ───────── Render ─────────

  if (loading && !menu) {
    return (
      <Screen title={t("header_menus")} back onBack={() => router.back()}>
        <ActivityIndicator color={colors.terracota} style={{ marginTop: spacing.xxl }} />
      </Screen>
    );
  }

  if (!menu && loadError) {
    return (
      <Screen title={t("header_menus")} back onBack={() => router.back()}>
        <NetworkError onRetry={() => void reload()} />
      </Screen>
    );
  }

  if (!menu) return null;

  const noContent = menu.items.length === 0 && partition.sections.length === 0;

  // Bloque 5 — botón PDF arriba a la derecha que abre el preview sheet.
  // Reemplaza el "view_client_btn" que estaba al pie de la pantalla.
  const pdfHeaderBtn =
    canExport && menu.items.length > 0 ? (
      <Pressable
        style={styles.headerPdfBtn}
        onPress={() => setPreviewOpen(true)}
        disabled={exporting}
        accessibilityLabel={t("menu_btn_pdf")}
      >
        <Ionicons name="download-outline" size={12} color={colors.ink} />
        <Text style={styles.headerPdfLabel}>{t("menu_btn_pdf")}</Text>
      </Pressable>
    ) : null;

  // Bloque 5 (segunda tanda) — toggle "en servicio" al lado del PDF.
  // Encendido = pill teal con dot blanco + "EN SERVICIO".
  // Apagado = pill paperSoft con borde edge + dot mute + "Fuera de servicio".
  const inServiceToggle = canEdit ? (
    <Pressable
      style={[
        styles.inServicePill,
        menu.inService ? styles.inServicePillOn : styles.inServicePillOff,
      ]}
      onPress={handleToggleInService}
      disabled={togglingInService}
      accessibilityLabel={t("menu_in_service_toggle_a11y")}
    >
      <View
        style={[
          styles.inServiceDot,
          menu.inService ? styles.inServiceDotOn : styles.inServiceDotOff,
        ]}
      />
      <Text
        style={[
          styles.inServicePillLabel,
          menu.inService ? styles.inServicePillLabelOn : styles.inServicePillLabelOff,
        ]}
      >
        {menu.inService ? t("menu_in_service_on") : t("menu_in_service_off")}
      </Text>
    </Pressable>
  ) : null;

  const duplicateHeaderBtn = canEdit ? (
    <Pressable
      style={styles.headerPdfBtn}
      onPress={handleDuplicateMenu}
      disabled={duplicating}
      accessibilityLabel={t("btn_duplicar")}
    >
      <Ionicons name="copy-outline" size={12} color={colors.ink} />
      <Text style={styles.headerPdfLabel}>{t("btn_duplicar")}</Text>
    </Pressable>
  ) : null;

  const refreshHeaderBtn = (
    <Pressable
      hitSlop={12}
      onPress={onRefresh}
      disabled={refreshing}
      style={refreshing ? styles.refreshBtnDisabled : undefined}
      accessibilityLabel={t("refresh_label")}
    >
      <Ionicons name="refresh-outline" size={20} color={colors.ink} />
    </Pressable>
  );

  const headerRight = (
    <View style={styles.headerRightRow}>
      {inServiceToggle}
      {duplicateHeaderBtn}
      {pdfHeaderBtn}
      {refreshHeaderBtn}
    </View>
  );

  return (
    <Screen back onBack={() => router.back()} right={headerRight}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: spacing.xl + kb }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.terracota}
            colors={[colors.terracota]}
            progressBackgroundColor={colors.paper}
          />
        }
      >
        {/* Header editorial del mockup */}
        <View style={styles.menuHeader}>
          <Text style={styles.menuEyebrow}>
            {menu.season
              ? t("menu_eyebrow_season_dishes", {
                  season: menu.season.toUpperCase(),
                  count: menu.items.length,
                })
              : t("menu_eyebrow_dishes_only", { count: menu.items.length })}
          </Text>
          <Text style={styles.menuTitle}>{menu.name}</Text>
        </View>
        <View style={styles.menuHeaderDivider} />

        <View style={styles.styleRow}>
          {STYLES.map((s) => {
            const isCustom = s.id === "custom";
            const active = menu.presentationStyle === s.id;
            return (
              <Pressable
                key={s.id}
                style={[styles.styleChip, active && styles.styleChipActive]}
                onPress={() => {
                  if (!canEdit) return;
                  // Chip custom ya activo → reabre la preview en vez de no-opear.
                  if (isCustom && active) {
                    if (menu.menuStyleSpec) setStylePreview(menu.menuStyleSpec);
                    return;
                  }
                  if (isCustom && !menu.hasCustomStyle) {
                    handleStartStyleCapture(true);
                    return;
                  }
                  void handleStyleChange(s.id);
                }}
                disabled={!canEdit || (active && !isCustom) || (isCustom && styleUploading)}
              >
                <Text style={[styles.styleLabel, active && styles.styleLabelActive]}>
                  {t(s.labelKey)}
                </Text>
              </Pressable>
            );
          })}
          {canEdit && menu.presentationStyle === "custom" ? (
            <Pressable
              style={styles.styleRecaptureBtn}
              onPress={() => handleStartStyleCapture(false)}
              disabled={styleUploading}
              accessibilityLabel={t("style_custom_recapture")}
            >
              <Ionicons name="camera-outline" size={14} color={colors.terracota} />
            </Pressable>
          ) : null}
        </View>

        {/* "Tu estilo" — card de progreso mientras dura la extracción visión
            (10-40s, hasta 90s con el timeout). Sin esto el chef no tenía
            ninguna señal de que la subida seguía viva. */}
        {styleUploading ? (
          <View style={styles.styleProcessingCard}>
            <ActivityIndicator color={colors.terracota} size="small" />
            <Text style={styles.styleProcessingLabel}>{t("menu_style_processing")}</Text>
          </View>
        ) : null}

        {noContent ? (
          <View style={styles.emptyMenuState}>
            <Text style={styles.emptyMenuHint}>{t("empty_menu_hint")}</Text>
            {canEdit ? (
              <View style={styles.emptyMenuActions}>
                <Pressable
                  style={styles.addSectionBtn}
                  onPress={() => setAddSectionOpen(true)}
                >
                  <Ionicons name="add" size={14} color={colors.terracota} />
                  <Text style={styles.addSectionLabel}>{t("section_add")}</Text>
                </Pressable>
                <Pressable
                  style={styles.addSectionBtn}
                  onPress={() => setBankPickerForUnsectioned(true)}
                >
                  <Ionicons name="add-circle-outline" size={14} color={colors.terracota} />
                  <Text style={styles.addSectionLabel}>{t("recipe_bank_cta")}</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : (
          <>
            {partition.sections.map(({ section, items }, sectionIdx) => {
              const isCollapsed = !!collapsed[section.id];
              return (
                <View key={section.id} style={styles.sectionBlock}>
                  <SectionHeader
                    section={section}
                    index={sectionIdx + 1}
                    count={items.length}
                    isCollapsed={isCollapsed}
                    canEdit={canEdit}
                    placeholder={t("section_name_placeholder")}
                    eyebrowLabel={t("menu_category_eyebrow", { n: sectionIdx + 1 })}
                    dishesLabel={t("menu_eyebrow_dishes_only", { count: items.length })}
                    onToggle={toggleSection}
                    onSaveName={handleSaveSectionName}
                    onDelete={handleOpenDeleteSection}
                  />
                  {isCollapsed ? null : (
                    <>
                      {items.length === 0 ? (
                        <Text style={styles.sectionEmptyHint}>{t("section_empty_hint")}</Text>
                      ) : null}
                      {items.map((d, i) => (
                        <DishCard
                          key={d.id}
                          dish={d}
                          sectionLabel={section.name}
                          canEdit={canEdit}
                          canViewStaffRecipe={canViewStaffRecipe}
                          isFirst={i === 0}
                          isLast={i === items.length - 1}
                          isDeleting={deletingItemId === d.id}
                          isReordering={reorderingItemId === d.id}
                          namePlaceholder={t("recetas_form_title_placeholder")}
                          descPlaceholder={t("recetas_form_notes_placeholder")}
                          viewRecipeLabel={t("dish_view_recipe")}
                          clearCustomNameLabel={t("dish_custom_name_clear")}
                          fromRecipeBookLabel={t("menu_from_recipe_book")}
                          onSaveName={handleSaveItemName}
                          onSaveDesc={handleSaveItemDesc}
                          onSavePrice={handleSaveItemPrice}
                          onClearCustomName={handleClearCustomName}
                          onOpenSectionPicker={handleOpenSectionPickerForItem}
                          onReorder={handleReorderItem}
                          onDelete={handleOpenDeleteItem}
                          onViewRecipe={handleViewRecipe}
                        />
                      ))}
                      {canEdit ? (
                        <Pressable
                          style={styles.addDishBtn}
                          onPress={() => handleOpenBankForSection(section.id)}
                        >
                          <Ionicons name="add-circle-outline" size={14} color={colors.terracota} />
                          <Text style={styles.addDishLabel}>{t("recipe_bank_cta")}</Text>
                        </Pressable>
                      ) : null}
                    </>
                  )}
                </View>
              );
            })}

            {partition.unsectioned.length > 0 ? (
              <View style={styles.sectionBlock}>
                <Text style={styles.sectionNameMute}>{t("section_unassigned")}</Text>
                {partition.unsectioned.map((d, i) => (
                  <DishCard
                    key={d.id}
                    dish={d}
                    sectionLabel={t("section_unassigned")}
                    canEdit={canEdit}
                    canViewStaffRecipe={canViewStaffRecipe}
                    isFirst={i === 0}
                    isLast={i === partition.unsectioned.length - 1}
                    isDeleting={deletingItemId === d.id}
                    isReordering={reorderingItemId === d.id}
                    namePlaceholder={t("recetas_form_title_placeholder")}
                    descPlaceholder={t("recetas_form_notes_placeholder")}
                    viewRecipeLabel={t("dish_view_recipe")}
                    clearCustomNameLabel={t("dish_custom_name_clear")}
                    fromRecipeBookLabel={t("menu_from_recipe_book")}
                    onSaveName={handleSaveItemName}
                    onSaveDesc={handleSaveItemDesc}
                    onSavePrice={handleSaveItemPrice}
                    onClearCustomName={handleClearCustomName}
                    onOpenSectionPicker={handleOpenSectionPickerForItem}
                    onReorder={handleReorderItem}
                    onDelete={handleOpenDeleteItem}
                    onViewRecipe={handleViewRecipe}
                  />
                ))}
                {canEdit ? (
                  <Pressable
                    style={styles.addDishBtn}
                    onPress={() => setBankPickerForUnsectioned(true)}
                  >
                    <Ionicons name="add-circle-outline" size={14} color={colors.terracota} />
                    <Text style={styles.addDishLabel}>{t("recipe_bank_cta")}</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {canEdit ? (
              <Pressable style={styles.addSectionBtn} onPress={() => setAddSectionOpen(true)}>
                <Ionicons name="add" size={14} color={colors.terracota} />
                <Text style={styles.addSectionLabel}>{t("section_add")}</Text>
              </Pressable>
            ) : null}
          </>
        )}

        {/* Bloque 5: el botón de "Vista cliente / PDF" se movió al header.
            Lo eliminamos del pie para no duplicar. */}
      </ScrollView>

      <ExportPreviewSheet
        open={previewOpen}
        menu={menu}
        exporting={exporting}
        canEdit={canEdit}
        onClose={() => setPreviewOpen(false)}
        onChanged={() => reload({ silent: true })}
        onDownload={async () => {
          await exportPdf();
          setPreviewOpen(false);
        }}
      />

      <StylePreviewSheet
        open={stylePreview !== null}
        spec={stylePreview}
        exporting={exporting}
        onClose={() => setStylePreview(null)}
        onViewPdf={() => void exportPdf("custom")}
      />

      <SectionPickerSheet
        open={sectionPickerForItem !== null}
        sections={menu.sections}
        currentSectionId={
          menu.items.find((it) => it.id === sectionPickerForItem)?.sectionId ?? null
        }
        onClose={() => setSectionPickerForItem(null)}
        onPick={(sectionId) => {
          if (sectionPickerForItem) void handleMoveItem(sectionPickerForItem, sectionId);
        }}
      />

      <SectionPresetSheet
        open={addSectionOpen}
        onClose={() => setAddSectionOpen(false)}
        onPick={handleAddSection}
      />

      <RecipeBankPickerSheet
        open={bankPickerForSection !== null || bankPickerForUnsectioned}
        alreadyOnMenu={menu.items.map((it) => it.recipeId)}
        onClose={() => {
          setBankPickerForSection(null);
          setBankPickerForUnsectioned(false);
        }}
        onPick={(recipeId) => {
          const targetSectionId = bankPickerForUnsectioned ? null : bankPickerForSection;
          void handleAddDishFromBank(targetSectionId, recipeId);
        }}
      />

      <ConfirmSheet
        open={!!pendingDeleteItem}
        title={t("confirm_delete_dish_title")}
        body={t("confirm_delete_dish_body", {
          name: pendingDeleteItem?.name ?? "",
        })}
        confirmLabel={deletingItemId ? "…" : t("confirm_delete")}
        cancelLabel={t("confirm_cancel")}
        destructive
        busy={deletingItemId !== null}
        onConfirm={handleConfirmDeleteItem}
        onCancel={() => {
          if (!deletingItemId) setPendingDeleteItem(null);
        }}
      />

      <ConfirmSheet
        open={!!pendingDeleteSection}
        title={t("confirm_delete_section_title")}
        body={t("confirm_delete_section_body", {
          name: pendingDeleteSection?.name ?? "",
        })}
        confirmLabel={deletingSection ? "…" : t("confirm_delete")}
        cancelLabel={t("confirm_cancel")}
        destructive
        onConfirm={handleConfirmDeleteSection}
        onCancel={() => {
          if (!deletingSection) setPendingDeleteSection(null);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  refreshBtnDisabled: { opacity: 0.4 },
  content: { paddingHorizontal: spacing.xl, paddingVertical: spacing.xl, gap: spacing.lg },
  // Bloque 5 — header editorial del menú: eyebrow caps + título serif italic.
  menuHeader: { gap: 4 },
  menuEyebrow: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.eyebrow,
    color: colors.mute,
    letterSpacing: 1.4,
  },
  menuTitle: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSizes.serifXl,
    color: colors.ink,
    lineHeight: fontSizes.serifXl * 1.15,
  },
  menuHeaderDivider: {
    height: 0.5,
    backgroundColor: colors.edge,
    marginTop: spacing.xs,
  },
  // Bloque 5 — botón PDF en el header (pill teal con ícono download).
  headerPdfBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 0.5,
    borderColor: colors.edge,
    backgroundColor: colors.paper,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
  },
  headerPdfLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.ink,
    fontWeight: "600",
    letterSpacing: 0.8,
  },
  // Bloque 5 (segunda tanda) — toggle "EN SERVICIO" pill al lado del PDF.
  headerRightRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  inServicePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderWidth: 0.5,
  },
  inServicePillOn: {
    backgroundColor: colors.teal,
    borderColor: colors.teal,
  },
  inServicePillOff: {
    backgroundColor: colors.paperSoft,
    borderColor: colors.edge,
  },
  inServiceDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  inServiceDotOn: { backgroundColor: colors.paper },
  inServiceDotOff: { backgroundColor: colors.mute },
  inServicePillLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    fontWeight: "600",
    letterSpacing: 0.8,
  },
  inServicePillLabelOn: { color: colors.paper },
  inServicePillLabelOff: { color: colors.mute },
  styleRow: { flexDirection: "row", gap: spacing.xs },
  styleChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.pill,
    borderWidth: 0.5,
    borderColor: colors.edge,
    backgroundColor: colors.paperSoft,
  },
  styleChipActive: { backgroundColor: colors.terracota, borderColor: colors.terracota },
  styleLabel: { fontFamily: fonts.sans, fontSize: fontSizes.bodySm, color: colors.inkSoft },
  styleLabelActive: { color: colors.paper, fontWeight: "600" },
  // "Tu estilo" — mini botón de re-captura, mismo alto visual que los chips.
  styleRecaptureBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.pill,
    borderWidth: 0.5,
    borderColor: colors.edge,
    backgroundColor: colors.paperSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  // "Tu estilo" — card compacta de progreso mientras dura la extracción.
  styleProcessingCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.paperSoft,
    borderWidth: 0.5,
    borderColor: colors.edge,
    borderRadius: radii.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  styleProcessingLabel: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.inkSoft,
  },
  dishCard: {
    backgroundColor: colors.paperSoft,
    borderRadius: radii.md,
    borderWidth: 0.5,
    borderColor: colors.edge,
    padding: spacing.md,
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  dishTopRow: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  dishName: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSizes.serifBody,
    color: colors.ink,
    padding: 0,
    margin: 0,
  },
  dishDesc: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.mute,
    marginTop: 2,
    lineHeight: fontSizes.bodySm * 1.5,
    padding: 0,
  },
  priceBox: { flexDirection: "row", alignItems: "center", gap: 2 },
  priceInput: {
    backgroundColor: colors.paper,
    borderWidth: 0.5,
    borderColor: colors.edge,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    fontFamily: fonts.sans,
    fontSize: fontSizes.body,
    color: colors.terracota,
    fontWeight: "600",
    minWidth: 50,
    textAlign: "right",
  },
  priceUnit: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.mute,
  },
  dishActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: spacing.xs,
    borderTopWidth: 0.5,
    borderTopColor: colors.edge,
  },
  linkLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.terracota,
    letterSpacing: 0.4,
  },
  emptyText: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSizes.serifBody,
    color: colors.mute,
    marginTop: spacing.sm,
  },
  emptyMenuState: {
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.lg,
  },
  emptyMenuHint: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSizes.serifBody,
    color: colors.mute,
    textAlign: "center",
    lineHeight: fontSizes.body * 1.4,
    paddingHorizontal: spacing.lg,
  },
  emptyMenuActions: {
    flexDirection: "row",
    gap: spacing.sm,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  // Bloque 5 — cada sección es una card independiente (mockup imagen 2).
  sectionBlock: {
    gap: spacing.xs,
    backgroundColor: colors.paperSoft,
    borderRadius: radii.lg,
    borderWidth: 0.5,
    borderColor: colors.edge,
    padding: spacing.md,
  },
  sectionTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  sectionEyebrowSmall: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.eyebrow,
    color: colors.mute,
    letterSpacing: 1.4,
  },
  sectionDishesCount: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.mute,
    letterSpacing: 0.4,
  },
  sectionNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.edgeSoft,
    paddingBottom: spacing.sm,
    marginBottom: spacing.xs,
  },
  sectionNameInput: {
    flex: 1,
    fontFamily: fonts.serifItalic,
    fontSize: fontSizes.serifMd,
    color: colors.ink,
    padding: 0,
  },
  sectionNameMute: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.eyebrow,
    color: colors.mute,
    textTransform: "uppercase",
    letterSpacing: 1.4,
    fontWeight: "600",
    borderBottomWidth: 0.5,
    borderBottomColor: colors.edge,
    paddingBottom: spacing.xs,
    marginBottom: spacing.xs,
  },
  dishActionsLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  sectionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.paperWarm,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderWidth: 0.5,
    borderColor: colors.edgeSoft,
  },
  sectionChipLabel: {
    fontFamily: fonts.sans,
    fontSize: 10.5,
    color: colors.terracota,
    fontWeight: "600",
    letterSpacing: 0.4,
  },
  collapseToggle: {
    width: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionCount: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.mute,
    minWidth: 18,
    textAlign: "right",
    letterSpacing: 0.4,
  },
  reorderBox: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.xs,
    paddingTop: 2,
  },
  sectionEmptyHint: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSizes.serifBodySm,
    color: colors.mute,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  customNameBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    backgroundColor: colors.terracotaSoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.pill,
    marginTop: 4,
    marginBottom: 2,
  },
  customNameBadgeLabel: {
    fontFamily: fonts.sans,
    fontSize: 10,
    color: colors.terracota,
    fontWeight: "600",
    letterSpacing: 0.4,
  },
  // Bloque 5 — "+ Añadir plato" centrado en cada categoría (mockup imagen 2).
  addDishBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    alignSelf: "center",
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  addDishLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.terracota,
    fontWeight: "600",
    letterSpacing: 0.4,
  },
  // Bloque 5 — eyebrow "DESDE RECETARIO" debajo del nombre de cada plato.
  fromRecipeBookEyebrow: {
    fontFamily: fonts.sans,
    fontSize: 10,
    color: colors.terracota,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    fontWeight: "600",
    marginTop: 2,
  },
  addSectionBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.terracota,
    borderRadius: radii.pill,
  },
  addSectionLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.terracota,
    fontWeight: "600",
    letterSpacing: 0.8,
  },
});
