// Banco de Productos — lista. Patrón clonado de recetas.tsx (FlatList + memo
// + caché TTL + búsqueda sin caché). Filtros: todos, críticos, pendientes
// de precio, merma sugerida, archivados.

import { memo, useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { Screen } from "@/src/components/Screen";
import { Empty } from "@/src/components/Empty";
import { useI18n } from "@/src/hooks/useI18n";
import { useAuth } from "@/src/hooks/useAuth";
import {
  listProducts,
  migrateLegacyRecipes,
  recalcCriticality,
  type ListProductFilters,
  type Product,
} from "@/src/api/products";
import { showToast } from "@/src/components/Toast";
import { can } from "@atelier/shared";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

type FilterId =
  | "all"
  | "criticos"
  | "pendientes_precio"
  | "merma_sugerida"
  | "archivados";

const FILTERS: ReadonlyArray<{
  id: FilterId;
  labelKey:
    | "filter_productos_all"
    | "filter_productos_criticos"
    | "filter_productos_pendientes_precio"
    | "filter_productos_merma_sugerida"
    | "filter_productos_archivados";
}> = [
  { id: "all", labelKey: "filter_productos_all" },
  { id: "criticos", labelKey: "filter_productos_criticos" },
  { id: "pendientes_precio", labelKey: "filter_productos_pendientes_precio" },
  { id: "merma_sugerida", labelKey: "filter_productos_merma_sugerida" },
  { id: "archivados", labelKey: "filter_productos_archivados" },
];

function buildFilters(filter: FilterId, q: string): ListProductFilters {
  const base: ListProductFilters = { q: q || undefined };
  switch (filter) {
    case "all":
      // Default: solo activos + borradores (archivados se excluyen excepto en el filtro específico).
      return { ...base };
    case "criticos":
      return { ...base, criticality: "alta" };
    case "pendientes_precio":
      return { ...base, pendientePrecio: true };
    case "merma_sugerida":
      return { ...base, mermaOrigen: "sugerida" };
    case "archivados":
      return { ...base, estado: "archivado" };
  }
}

export default function ProductosScreen() {
  const { t } = useI18n();
  const { state: authState } = useAuth();
  const router = useRouter();

  const [filter, setFilter] = useState<FilterId>("all");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  // Widget de "críticos sin medir": count de productos con criticidad alta
  // + merma sugerida. Se actualiza vía la misma cache de listProducts.
  const [criticalPendingCount, setCriticalPendingCount] = useState(0);

  const role =
    authState.status === "signed-in" || authState.status === "needs-restaurant"
      ? authState.user.role
      : "viewer";
  const canCreate = can(role, "manage_products");
  // Migración legacy: solo admin (mismo gate que el endpoint).
  const canMigrate = can(role, "edit_restaurant");

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      let list = await listProducts(buildFilters(filter, q));
      // El filtro "all" excluye archivados. El filtro "archivados" solo los muestra.
      if (filter === "all") {
        list = list.filter((p) => p.estado !== "archivado");
      }
      setItems(list);
    } catch {
      // keep
    } finally {
      setLoading(false);
    }
  }, [filter, q]);

  // Count separado de críticos pendientes para el widget. Usa la misma
  // cache TTL — si los datos están frescos no pega al server.
  const reloadCriticalCount = useCallback(async () => {
    try {
      const list = await listProducts({
        criticality: "alta",
        mermaOrigen: "sugerida",
      });
      setCriticalPendingCount(list.filter((p) => p.estado !== "archivado").length);
    } catch {
      // No bloqueamos la pantalla si esto falla — el widget solo no se muestra.
    }
  }, []);

  useEffect(() => {
    void reload();
    void reloadCriticalCount();
  }, [reload, reloadCriticalCount]);

  useFocusEffect(
    useCallback(() => {
      void reload();
      void reloadCriticalCount();
    }, [reload, reloadCriticalCount]),
  );

  const handleCardPress = useCallback(
    (id: string) => router.push({ pathname: "/productos/[id]", params: { id } }),
    [router],
  );

  // Migración legacy: dry-run, mostrar Alert nativo con summary, confirmar → apply.
  // Usamos Alert (RN nativo) en lugar de un sheet custom: la acción es rara
  // (una sola vez por restaurante típicamente) y un Alert es suficiente.
  // Recalc de criticidad por peso económico (Fase 6). Admin only.
  const handleRecalcCriticality = useCallback(async () => {
    try {
      const dryRun = await recalcCriticality(true);
      if (dryRun.summary.changes === 0) {
        showToast(t("recalc_nothing_to_do"));
        return;
      }
      Alert.alert(
        t("btn_recalc_criticidad"),
        `${dryRun.summary.changes} cambios pendientes. ${dryRun.summary.skippedManual} productos con criticidad manual no se tocan.\n\n¿Aplicar?`,
        [
          { text: t("confirm_cancel"), style: "cancel" },
          {
            text: t("confirm_ok"),
            onPress: async () => {
              try {
                const applied = await recalcCriticality(false);
                showToast(
                  t("recalc_done", { changes: applied.summary.changes }),
                );
                void reload();
                void reloadCriticalCount();
              } catch (err) {
                showToast(err instanceof Error ? err.message : t("error_network"));
              }
            },
          },
        ],
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("error_network"));
    }
  }, [reload, reloadCriticalCount, t]);

  const handleMigrateLegacy = useCallback(async () => {
    try {
      const dryRun = await migrateLegacyRecipes("dry-run");
      const s = dryRun.summary;
      if (s.recipesToMigrate === 0) {
        showToast(t("migrate_nothing_to_do"));
        return;
      }
      Alert.alert(
        t("migrate_confirm_title"),
        `${s.recipesToMigrate} recetas · ${s.totalIngredients} ingredientes\n\n` +
          `Matches: ${s.matches.exact} exactos / ${s.matches.probable} probables (sin enlazar) / ${s.matches.none} nuevos drafts`,
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
                void reload();
              } catch (err) {
                showToast(err instanceof Error ? err.message : t("error_network"));
              }
            },
          },
        ],
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("error_network"));
    }
  }, [reload, t]);
  const renderItem = useCallback(
    ({ item }: { item: Product }) => (
      <ProductCard item={item} onPress={handleCardPress} t={t} />
    ),
    [handleCardPress, t],
  );
  const keyExtractor = useCallback((p: Product) => p.id, []);

  return (
    <Screen title={t("header_productos")}>
      {canCreate ? (
        <View style={styles.createRow}>
          <Pressable
            style={styles.createBtn}
            onPress={() => router.push("/productos/nuevo")}
          >
            <Ionicons name="add" size={16} color={colors.paper} />
            <Text style={styles.createLabel}>{t("btn_crear_producto")}</Text>
          </Pressable>
          {canMigrate ? (
            <Pressable
              style={styles.migrateBtn}
              onPress={handleMigrateLegacy}
              accessibilityLabel={t("btn_migrate_legacy")}
            >
              <Ionicons name="arrow-up-circle-outline" size={14} color={colors.terracota} />
              <Text style={styles.migrateLabel}>{t("btn_migrate_legacy")}</Text>
            </Pressable>
          ) : null}
          {canMigrate ? (
            <Pressable
              style={styles.migrateBtn}
              onPress={handleRecalcCriticality}
              accessibilityLabel={t("btn_recalc_criticidad")}
            >
              <Ionicons name="flame-outline" size={14} color={colors.terracota} />
              <Text style={styles.migrateLabel}>{t("btn_recalc_criticidad")}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* Widget de críticos pendientes — solo cuando hay productos con
          criticidad alta + merma sugerida sin medir. Tap filtra la lista. */}
      {criticalPendingCount > 0 && filter !== "criticos" ? (
        <Pressable
          style={styles.criticalBanner}
          onPress={() => setFilter("criticos")}
        >
          <Ionicons name="flame" size={16} color={colors.terracota} />
          <View style={{ flex: 1 }}>
            <Text style={styles.criticalTitle}>
              {t("productos_criticos_pendientes_title")}
            </Text>
            <Text style={styles.criticalBody}>
              {t("productos_criticos_pendientes_body", {
                count: criticalPendingCount,
              })}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={14} color={colors.terracota} />
        </Pressable>
      ) : null}

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
        contentContainerStyle={styles.listContent}
        style={styles.listScroll}
        initialNumToRender={12}
        maxToRenderPerBatch={6}
        windowSize={11}
        removeClippedSubviews
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={colors.terracota} style={{ marginTop: spacing.xl }} />
          ) : (
            <Empty
              icon="archive-outline"
              title={filter === "all" ? t("empty_productos_title") : t("empty_productos_filter")}
              sub={filter === "all" ? t("empty_productos_sub") : undefined}
            />
          )
        }
      />
    </Screen>
  );
}

const ProductCard = memo(function ProductCard({
  item,
  onPress,
  t,
}: {
  item: Product;
  onPress: (id: string) => void;
  t: ReturnType<typeof useI18n>["t"];
}) {
  const isCritical = item.criticality === "alta";
  const noPrice = item.precioCompra === 0;
  const mermaSuggested = item.mermaOrigen === "sugerida";
  return (
    <Pressable style={styles.productCard} onPress={() => onPress(item.id)}>
      <View style={{ flex: 1 }}>
        <View style={styles.titleRow}>
          {isCritical ? (
            <Ionicons name="flame" size={12} color={colors.terracota} style={{ marginRight: 4 }} />
          ) : null}
          <Text style={styles.productTitle} numberOfLines={1}>
            {item.name}
          </Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.category}>{t(categoryLabelKey(item.category))}</Text>
          {item.pezzatura ? <Text style={styles.pezzatura}>· {item.pezzatura}</Text> : null}
        </View>
        <View style={styles.metaRow}>
          {noPrice ? (
            <Text style={styles.priceWarn}>{t("filter_productos_pendientes_precio")}</Text>
          ) : (
            <Text style={styles.price}>
              € {(item.precioCompra / 100).toFixed(2)} /{t(unitLabelKey(item.unidadCompra))}
            </Text>
          )}
          {mermaSuggested ? (
            <Text style={styles.mermaWarn}>· {item.mermaPct.toFixed(0)}% {t("merma_origen_sugerida").toLowerCase()}</Text>
          ) : (
            <Text style={styles.mermaInfo}>· {item.mermaPct.toFixed(0)}% {t("producto_form_merma_label").split(" ")[0].toLowerCase()}</Text>
          )}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.mute} />
    </Pressable>
  );
});

function categoryLabelKey(
  c: Product["category"],
):
  | "category_pescado"
  | "category_carne"
  | "category_verdura"
  | "category_fruta"
  | "category_lacteo"
  | "category_panaderia"
  | "category_seco"
  | "category_especia"
  | "category_hierba"
  | "category_vinagre_aceite"
  | "category_otro" {
  return `category_${c}` as const;
}

function unitLabelKey(
  u: Product["unidadCompra"],
): "unit_kg" | "unit_g" | "unit_l" | "unit_ml" | "unit_unidad" | "unit_caja" {
  return `unit_${u}` as const;
}

const styles = StyleSheet.create({
  createRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.terracota,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 4,
  },
  createLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.paper,
    fontWeight: "600",
    letterSpacing: 0.8,
  },
  migrateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.paperSoft,
    borderRadius: radii.pill,
    borderWidth: 0.5,
    borderColor: colors.terracota,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 4,
  },
  migrateLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.terracota,
    fontWeight: "600",
    letterSpacing: 0.8,
  },
  criticalBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.xl,
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 0.5,
    borderColor: colors.terracota,
    backgroundColor: colors.terracotaSoft,
  },
  criticalTitle: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.terracota,
    fontWeight: "600",
  },
  criticalBody: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.ink,
    marginTop: 2,
  },
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
    paddingVertical: spacing.md,
    gap: spacing.xs,
    flexDirection: "row",
    alignItems: "center",
  },
  tab: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.pill,
    borderWidth: 0.5,
    borderColor: colors.edge,
    backgroundColor: colors.paperSoft,
  },
  tabActive: { backgroundColor: colors.terracota, borderColor: colors.terracota },
  tabLabel: { fontFamily: fonts.sans, fontSize: fontSizes.bodySm, color: colors.inkSoft },
  tabLabelActive: { color: colors.paper, fontWeight: "600" },
  listScroll: { flex: 1 },
  listContent: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.sm },
  productCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.paperSoft,
    borderRadius: radii.md,
    borderWidth: 0.5,
    borderColor: colors.edge,
    padding: spacing.md,
  },
  titleRow: { flexDirection: "row", alignItems: "center" },
  productTitle: {
    fontFamily: fonts.serif,
    fontStyle: "italic",
    fontSize: fontSizes.body,
    color: colors.ink,
    flexShrink: 1,
  },
  metaRow: { flexDirection: "row", gap: 4, alignItems: "center", marginTop: 4 },
  category: { fontFamily: fonts.sans, fontSize: fontSizes.caption, color: colors.inkSoft },
  pezzatura: { fontFamily: fonts.sans, fontSize: fontSizes.caption, color: colors.mute },
  price: { fontFamily: fonts.sans, fontSize: fontSizes.caption, color: colors.ink },
  priceWarn: { fontFamily: fonts.sans, fontSize: fontSizes.caption, color: colors.terracota, fontWeight: "600" },
  mermaInfo: { fontFamily: fonts.sans, fontSize: fontSizes.caption, color: colors.mute },
  mermaWarn: { fontFamily: fonts.sans, fontSize: fontSizes.caption, color: colors.terracota },
});
