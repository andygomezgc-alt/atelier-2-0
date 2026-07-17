// Banco de Productos — lista compacta tipo planilla.
//
// Filosofía (Andy 2026-05-15): el banco es plomería de precios, no espacio
// de trabajo creativo. Filas compactas con edición inline (Excel-like) para
// que el chef mantenga precios y mermas sin abrir pantallas.
//
// La criticidad es INVISIBLE al chef: el sistema la usa internamente para
// el recalc semanal automático pero no se muestra acá. Tampoco hay
// banner de "críticos pendientes" ni filtro "Críticos".
//
// Acciones administrativas (migrar recetas, info de criticidad auto) viven
// en /productos/ajustes — se llega ahí desde el ícono ⚙ en el header.

import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Screen } from "@/src/components/Screen";
import { Empty } from "@/src/components/Empty";
import { NetworkError } from "@/src/components/NetworkError";
import { BottomSheet } from "@/src/components/BottomSheet";
import { CategoryIcon } from "@/src/components/CategoryIcon";
import { EditableCell } from "@/src/components/EditableCell";
import { useI18n } from "@/src/hooks/useI18n";
import { downloadAndShare } from "@/src/lib/export-file";
import { formatEuros, formatEurosPerUnit } from "@/src/lib/money";
import { useAuth } from "@/src/hooks/useAuth";
import { useRefresh } from "@/src/hooks/useRefresh";
import {
  listProducts,
  patchProduct,
  type ListProductFilters,
  type Product,
  type ProductFull,
} from "@/src/api/products";
import { showToast } from "@/src/components/Toast";
import { can, resolvePezzaturaMode } from "@atelier/shared";
import type { ProductUnit } from "@atelier/shared";
import { useKeyboardHeight } from "@/src/lib/keyboard";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

type FilterId =
  | "all"
  | "pescado"
  | "carne"
  | "verdura"
  | "seco"
  | "sin_precio"
  | "pezzatura_pendiente";

const FILTERS: ReadonlyArray<{
  id: FilterId;
  labelKey:
    | "filter_productos_all"
    | "category_pescado"
    | "category_carne"
    | "category_verdura"
    | "category_seco"
    | "filter_productos_pendientes_precio"
    | "filter_productos_pezzatura_pendiente";
}> = [
  { id: "all", labelKey: "filter_productos_all" },
  { id: "pescado", labelKey: "category_pescado" },
  { id: "carne", labelKey: "category_carne" },
  { id: "verdura", labelKey: "category_verdura" },
  { id: "seco", labelKey: "category_seco" },
  { id: "sin_precio", labelKey: "filter_productos_pendientes_precio" },
  { id: "pezzatura_pendiente", labelKey: "filter_productos_pezzatura_pendiente" },
];

function buildFilters(filter: FilterId, q: string): ListProductFilters {
  const base: ListProductFilters = { q: q || undefined };
  switch (filter) {
    case "all":
      return base;
    case "pescado":
      return { ...base, category: "pescado" };
    case "carne":
      return { ...base, category: "carne" };
    case "verdura":
      return { ...base, category: "verdura" };
    case "seco":
      return { ...base, category: "seco" };
    case "sin_precio":
      return { ...base, pendientePrecio: true };
    case "pezzatura_pendiente":
      // Entrega A.5 Fase 8 — productos sin pezzatura cargada que SÍ se
      // usan por unidad en alguna receta. Sesión de mantenimiento.
      return { ...base, pezzaturaPendiente: true };
  }
}

// Costo real local — replica la fórmula del server para feedback inmediato
// tras inline edit (antes de que el patch round-tripee). El server confirma
// el valor canónico después.
function realCostLocal(cents: number, mermaPct: number): number {
  if (mermaPct >= 100) return cents;
  return Math.ceil(cents / (1 - mermaPct / 100));
}

// ProductDetail (full) → ProductListItem (lo que vive en el array de items).
function detailToListItem(d: ProductFull): Product {
  return {
    id: d.id,
    name: d.name,
    category: d.category,
    pezzatura: d.pezzatura,
    pezzaturaMode: d.pezzaturaMode,
    pezzaturaMin: d.pezzaturaMin,
    pezzaturaMax: d.pezzaturaMax,
    unidadCompra: d.unidadCompra,
    precioCompra: d.precioCompra,
    realCost: d.realCost,
    mermaPct: d.mermaPct,
    mermaOrigen: d.mermaOrigen,
    criticality: d.criticality,
    estado: d.estado,
    precioActualizadoAt: d.precioActualizadoAt,
    // El detail comparte el count con la lista (recipesUsingByUnitCount).
    usedByUnitCount: d.recipesUsingByUnitCount,
  };
}

function parseEurosToCents(input: string): number | null {
  if (!input.trim()) return null;
  const n = Number(input.replace(",", ".").trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}
function parseMermaPct(input: string): number | null {
  if (!input.trim()) return null;
  const n = Number(input.replace(",", ".").trim());
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return n;
}

const UNIT_SHORT: Record<ProductUnit, string> = {
  kg: "kg",
  g: "g",
  l: "l",
  ml: "ml",
  unidad: "ud",
  caja: "caja",
};

function formatRealCost(cents: number, unit: ProductUnit): string {
  return formatEurosPerUnit(cents, UNIT_SHORT[unit]);
}

export default function ProductosScreen() {
  const { t, lang } = useI18n();
  const { state: authState } = useAuth();
  const router = useRouter();
  const kb = useKeyboardHeight();

  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Sub-paso 6: el aviso de la tarjeta de costo en la receta navega acá
  // con ?filter=sin-precio para que el chef vea de inmediato qué productos
  // faltan precificar. Si llega ese query param, lo usamos como filtro inicial.
  const [loadError, setLoadError] = useState(false);

  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  const params = useLocalSearchParams<{ filter?: string }>();
  const initialFilter: FilterId =
    params.filter === "sin-precio" ? "sin_precio" : "all";
  const [filter, setFilter] = useState<FilterId>(initialFilter);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const role =
    authState.status === "signed-in" || authState.status === "needs-restaurant"
      ? authState.user.role
      : "viewer";
  const canCreate = can(role, "manage_products");

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      let list = await listProducts(buildFilters(filter, q));
      // El chip "Archivados" ya no existe (Andy 2026-07-14 — el modelo nuevo
      // es solo eliminar/papelera). Los archivados legacy que queden se
      // descartan client-side; el server no filtra estado automáticamente.
      list = list.filter((p) => p.estado !== "archivado");
      setItems(list);
      setLoadError(false);
    } catch {
      setLoadError(true);
      if (itemsRef.current.length > 0) {
        showToast(t("toast_offline_stale"));
      }
    } finally {
      setLoading(false);
    }
  }, [filter, q, t]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const { refreshing, onRefresh } = useRefresh(["products:list:"], reload);

  // Inline edit handlers. Optimistic update + revert on error. La EditableCell
  // re-throwea para mostrar borde rojo + retener el input.
  const handleSavePrice = useCallback(
    async (id: string, cents: number) => {
      const before = items.find((p) => p.id === id);
      if (!before) return;
      // Optimistic: actualizamos local antes del round-trip.
      setItems((prev) =>
        prev.map((p) =>
          p.id === id
            ? {
                ...p,
                precioCompra: cents,
                realCost: realCostLocal(cents, p.mermaPct),
                precioActualizadoAt: new Date().toISOString(),
              }
            : p,
        ),
      );
      try {
        const updated = await patchProduct(id, { precioCompra: cents });
        setItems((prev) => prev.map((p) => (p.id === id ? detailToListItem(updated) : p)));
      } catch (err) {
        // Revert
        setItems((prev) => prev.map((p) => (p.id === id ? before : p)));
        throw err;
      }
    },
    [items],
  );

  const handleSaveMerma = useCallback(
    async (id: string, pct: number) => {
      const before = items.find((p) => p.id === id);
      if (!before) return;
      setItems((prev) =>
        prev.map((p) =>
          p.id === id
            ? {
                ...p,
                mermaPct: pct,
                realCost: realCostLocal(p.precioCompra, pct),
                // Al editar la merma inline, el chef la está confirmando manualmente.
                mermaOrigen: "confirmada" as const,
              }
            : p,
        ),
      );
      try {
        const updated = await patchProduct(id, { mermaPct: pct });
        setItems((prev) => prev.map((p) => (p.id === id ? detailToListItem(updated) : p)));
      } catch (err) {
        setItems((prev) => prev.map((p) => (p.id === id ? before : p)));
        throw err;
      }
    },
    [items],
  );

  // Exportar el banco — PDF (idioma del chef) o CSV (para Excel). Descarga del
  // server + share-sheet. Disponible para cualquier rol (exportar es lectura).
  async function handleExport(kind: "pdf" | "csv") {
    if (exporting) return;
    setExporting(true);
    try {
      const ok =
        kind === "pdf"
          ? await downloadAndShare(
              `/api/products/export/pdf?lang=${lang}`,
              "productos.pdf",
              "application/pdf",
            )
          : await downloadAndShare(
              `/api/products/export/csv`,
              "productos.csv",
              "text/csv",
            );
      setExportOpen(false);
      showToast(ok ? t("toast_pdf_shared") : t("error_network"));
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("error_network"));
    } finally {
      setExporting(false);
    }
  }

  const handleRowPress = useCallback(
    (id: string) => router.push({ pathname: "/productos/[id]", params: { id } }),
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: Product }) => (
      <ProductRow
        item={item}
        onPress={handleRowPress}
        onSavePrice={handleSavePrice}
        onSaveMerma={handleSaveMerma}
      />
    ),
    [handleRowPress, handleSavePrice, handleSaveMerma],
  );
  const keyExtractor = useCallback((p: Product) => p.id, []);

  // ⚙ → Ajustes del banco. Solo visible para admin (mismo gate que
  // edit_restaurant del lado del endpoint de migración). Para roles
  // chef/sous-chef/viewer el header queda sin acción.
  const canManage = can(role, "edit_restaurant");
  const headerRight = (
    <View style={styles.headerActions}>
      <Pressable
        hitSlop={8}
        onPress={() => setExportOpen(true)}
        accessibilityLabel={t("export_a11y")}
      >
        <Ionicons name="share-outline" size={20} color={colors.terracota} />
      </Pressable>
      {canCreate ? (
        <Pressable
          hitSlop={8}
          onPress={() => router.push("/productos/papelera")}
          accessibilityLabel={t("papelera_title")}
        >
          <Ionicons name="trash-outline" size={20} color={colors.teal} />
        </Pressable>
      ) : null}
      {canManage ? (
        <Pressable
          hitSlop={10}
          onPress={() => router.push("/productos/ajustes")}
          accessibilityLabel={t("ajustes_title")}
        >
          <Ionicons name="settings-outline" size={20} color={colors.ink} />
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <Screen title={t("header_productos")} right={headerRight}>
      <View style={styles.searchRow}>
        <Ionicons name="search" size={16} color={colors.mute} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder={t("producto_search_placeholder")}
          placeholderTextColor={colors.mute}
          style={styles.searchInput}
          autoCorrect={false}
          autoCapitalize="none"
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsRow}
        style={styles.tabsScroll}
      >
        {FILTERS.map((f) => (
          <Pressable
            key={f.id}
            onPress={() => setFilter(f.id)}
            style={[styles.tab, filter === f.id && styles.tabActive]}
          >
            <Text style={[styles.tabLabel, filter === f.id && styles.tabLabelActive]}>
              {t(f.labelKey)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={[styles.listContent, { paddingBottom: 96 + kb }]}
        style={styles.listScroll}
        initialNumToRender={20}
        maxToRenderPerBatch={10}
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
        ItemSeparatorComponent={RowSeparator}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={colors.terracota} style={{ marginTop: spacing.xl }} />
          ) : loadError && items.length === 0 ? (
            <NetworkError onRetry={() => void reload()} />
          ) : (
            <Empty
              icon="archive-outline"
              title={filter === "all" ? t("empty_productos_title") : t("empty_productos_filter")}
              sub={filter === "all" ? t("empty_productos_sub") : undefined}
            />
          )
        }
      />

      {/* FAB para crear producto */}
      {canCreate ? (
        <Pressable
          style={styles.fab}
          onPress={() => router.push("/productos/nuevo")}
          accessibilityLabel={t("btn_crear_producto")}
        >
          <Ionicons name="add" size={24} color={colors.paper} />
        </Pressable>
      ) : null}

      <BottomSheet open={exportOpen} onClose={() => setExportOpen(false)}>
        <View style={styles.exportSheet}>
          <Text style={styles.exportTitle}>{t("export_sheet_title")}</Text>
          <Pressable
            style={styles.exportOption}
            onPress={() => handleExport("pdf")}
            disabled={exporting}
          >
            <Ionicons name="document-text-outline" size={20} color={colors.terracota} />
            <Text style={styles.exportOptionLabel}>{t("btn_export_products_pdf")}</Text>
          </Pressable>
          <Pressable
            style={styles.exportOption}
            onPress={() => handleExport("csv")}
            disabled={exporting}
          >
            <Ionicons name="grid-outline" size={20} color={colors.terracota} />
            <Text style={styles.exportOptionLabel}>{t("btn_export_products_csv")}</Text>
          </Pressable>
        </View>
      </BottomSheet>
    </Screen>
  );
}

// Fila compacta tipo planilla.
//
// Layout:
//   [icon] [nombre              ] [precio  ] [merma]
//          [/unidad              ] [real cost]
//
// El área izquierda (icon + nombre + /unidad) navega a detalle.
// El área de precio y la de merma son TextInputs in-place (EditableCell).
const ProductRow = memo(function ProductRow({
  item,
  onPress,
  onSavePrice,
  onSaveMerma,
}: {
  item: Product;
  onPress: (id: string) => void;
  onSavePrice: (id: string, cents: number) => Promise<void>;
  onSaveMerma: (id: string, pct: number) => Promise<void>;
}) {
  const { t } = useI18n();
  const handlePriceSave = useCallback(
    (cents: number) => onSavePrice(item.id, cents),
    [item.id, onSavePrice],
  );
  const handleMermaSave = useCallback(
    (pct: number) => onSaveMerma(item.id, pct),
    [item.id, onSaveMerma],
  );

  const hasPrice = item.precioCompra > 0;
  const isArchived = item.estado === "archivado";

  // Entrega A.5 Fase 8 — indicador pasivo "pezzatura pendiente".
  // Aparece solo cuando:
  //   1. La categoría del producto admite pezzatura (resolvePezzaturaMode!==null).
  //   2. Alguna receta usa el producto por unidad (usedByUnitCount > 0).
  //   3. El producto no tiene pezzatura cargada (pezzaturaMode===null).
  // No clickeable. Info, no llamado a la acción.
  const isPezzaturaPending =
    item.pezzaturaMode === null &&
    item.usedByUnitCount > 0 &&
    resolvePezzaturaMode(item.name, item.category) !== null;

  return (
    <View style={[styles.row, isArchived && styles.rowArchived]}>
      <Pressable style={styles.iconAndName} onPress={() => onPress(item.id)}>
        <CategoryIcon category={item.category} size={14} />
        <View style={styles.nameCol}>
          <Text
            style={[styles.name, isArchived && styles.nameArchived]}
            numberOfLines={1}
          >
            {item.name}
          </Text>
          <View style={styles.subRow}>
            <Text style={styles.unitHint}>
              /{UNIT_SHORT[item.unidadCompra]}
            </Text>
            {isPezzaturaPending ? (
              <Text style={styles.pezzaturaPendienteText} numberOfLines={1}>
                · {t("product_list_pezzatura_pendiente")}
              </Text>
            ) : null}
          </View>
        </View>
      </Pressable>

      <View style={styles.priceCol}>
        <EditableCell
          value={item.precioCompra}
          format={(c) => formatEuros(c)}
          parse={parseEurosToCents}
          onSave={handlePriceSave}
          placeholderForZero="—"
          width={72}
          readOnly={isArchived}
        />
        <Text style={styles.realCost}>
          {hasPrice ? formatRealCost(item.realCost, item.unidadCompra) : ""}
        </Text>
      </View>

      <View style={styles.mermaCol}>
        <EditableCell
          value={item.mermaPct}
          format={(v) => `${v.toFixed(0)}%`}
          parse={parseMermaPct}
          onSave={handleMermaSave}
          width={48}
          readOnly={isArchived}
        />
      </View>
    </View>
  );
});

function RowSeparator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: fontSizes.body,
    color: colors.ink,
    paddingVertical: spacing.sm,
  },
  tabsScroll: { flexGrow: 0, flexShrink: 0 },
  tabsRow: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
    flexDirection: "row",
    alignItems: "center",
  },
  tab: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    borderWidth: 0.5,
    borderColor: colors.edge,
    backgroundColor: colors.paperSoft,
  },
  tabActive: { backgroundColor: colors.terracota, borderColor: colors.terracota },
  tabLabel: { fontFamily: fonts.sans, fontSize: fontSizes.bodySm, color: colors.inkSoft },
  tabLabelActive: { color: colors.paper, fontWeight: "600" },
  listScroll: { flex: 1 },
  listContent: { paddingHorizontal: spacing.xl, paddingBottom: 96 },
  // Filas planas — el separator es una línea fina entre filas.
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    minHeight: 48,
  },
  // Vista archivo: opacity reducida en toda la fila — comunica
  // "estos están fuera de circulación" sin agregar badges.
  rowArchived: { opacity: 0.55 },
  iconAndName: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  nameCol: { flex: 1 },
  name: { fontFamily: fonts.sans, fontSize: fontSizes.body, color: colors.ink },
  nameArchived: { fontStyle: "italic" },
  unitHint: { fontFamily: fonts.sans, fontSize: fontSizes.caption, color: colors.mute, marginTop: 2 },
  subRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
  pezzaturaPendienteText: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.mute,
    marginTop: 2,
    marginLeft: spacing.xs,
    fontStyle: "italic",
  },
  priceCol: { alignItems: "flex-end" },
  realCost: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.mute,
    marginTop: 2,
  },
  mermaCol: { alignItems: "flex-end", justifyContent: "center" },
  separator: {
    height: 0.5,
    backgroundColor: colors.edge,
    marginVertical: 0,
  },
  exportSheet: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, gap: spacing.xs },
  exportTitle: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSizes.serifBody,
    color: colors.ink,
    marginBottom: spacing.sm,
  },
  exportOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.edge,
  },
  exportOptionLabel: { fontFamily: fonts.sans, fontSize: fontSizes.body, color: colors.ink },
  fab: {
    position: "absolute",
    right: spacing.xl,
    bottom: spacing.xl,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.terracota,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
});
