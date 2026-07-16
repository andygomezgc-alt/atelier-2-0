import { memo, useCallback, useEffect, useState } from "react";
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
import { useRouter, useFocusEffect } from "expo-router";
import { Screen } from "@/src/components/Screen";
import { Empty } from "@/src/components/Empty";
import { ConfirmSheet } from "@/src/components/ConfirmSheet";
import { SectionExplainer } from "@/src/components/SectionExplainer";
import { ensureRestaurant } from "@/src/components/LazyRestaurantHost";
import { useI18n } from "@/src/hooks/useI18n";
import { formatEuros } from "@/src/lib/money";
import { listRecipes, deleteRecipe, type Recipe, type ListFilters } from "@/src/api/recipes";
import { downloadAndShare } from "@/src/lib/export-file";
import { showToast } from "@/src/components/Toast";
import { useAuth } from "@/src/hooks/useAuth";
import { useRefresh } from "@/src/hooks/useRefresh";
import { can } from "@atelier/shared";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

type FilterId = "in_progress" | "priority" | "approved" | "all";

const FILTERS: ReadonlyArray<{ id: FilterId; labelKey: "recetas_filter_in_progress" | "recetas_filter_priority" | "recetas_filter_approved" | "recetas_filter_all" }> = [
  { id: "all", labelKey: "recetas_filter_all" },
  { id: "in_progress", labelKey: "recetas_filter_in_progress" },
  { id: "priority", labelKey: "recetas_filter_priority" },
  { id: "approved", labelKey: "recetas_filter_approved" },
];

function buildFilters(filter: FilterId, q: string): ListFilters {
  switch (filter) {
    case "in_progress":
      return { q: q || undefined };
    case "priority":
      return { priority: true, q: q || undefined };
    case "approved":
      return { state: "approved", q: q || undefined };
    case "all":
      return { q: q || undefined };
  }
}

export default function RecetasScreen() {
  const { t, lang } = useI18n();
  const { state: authState } = useAuth();
  const router = useRouter();

  const [filter, setFilter] = useState<FilterId>("all");
  const [q, setQ] = useState("");
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<Recipe | null>(null);
  const [exporting, setExporting] = useState(false);

  const role =
    authState.status === "signed-in" || authState.status === "needs-restaurant"
      ? authState.user.role
      : "viewer";
  const canDelete = can(role, "approve_recipe");
  // A-12: en needs-restaurant el role default es viewer pero el chef va a ser
  // admin de su sitio en cuanto cree el restaurante (lazy). Le mostramos los
  // botones de crear para que la app le diga qué puede hacer.
  const hasRestaurant =
    (authState.status === "signed-in" || authState.status === "needs-restaurant") &&
    Boolean(authState.user.restaurantId);
  const canCreate = !hasRestaurant || can(role, "edit_recipe");

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      let list = await listRecipes(buildFilters(filter, q));
      if (filter === "in_progress") {
        list = list.filter((r) => r.state !== "approved");
      }
      setRecipes(list);
    } catch {
      // keep current
    } finally {
      setLoading(false);
    }
  }, [filter, q]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const { refreshing, onRefresh } = useRefresh(["recipes:list:"], reload);

  // Exportar el recetario completo (PDF) — descarga del server y abre el
  // share-sheet. Va en el idioma del chef. Disponible para cualquier rol
  // (exportar es lectura).
  async function handleExportRecipebook() {
    if (exporting) return;
    setExporting(true);
    try {
      const ok = await downloadAndShare(
        `/api/recipes/export/pdf?lang=${lang}`,
        "recetario.pdf",
        "application/pdf",
      );
      showToast(ok ? t("toast_pdf_shared") : t("error_network"));
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("error_network"));
    } finally {
      setExporting(false);
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setPendingDelete(null);
    try {
      await deleteRecipe(id);
      setRecipes((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("error_network"));
    }
  }

  // Handlers estables — los pasamos a RecipeCard memo, así un cambio en el
  // search/filter no fuerza re-render de todos los cards.
  const handleCardPress = useCallback(
    (id: string) => router.push({ pathname: "/recetas/[id]", params: { id } }),
    [router],
  );
  const handleDeletePress = useCallback((r: Recipe) => setPendingDelete(r), []);
  const renderItem = useCallback(
    ({ item }: { item: Recipe }) => (
      <RecipeCard
        item={item}
        canDelete={canDelete}
        onPress={handleCardPress}
        onDelete={handleDeletePress}
        t={t}
      />
    ),
    [canDelete, handleCardPress, handleDeletePress, t],
  );
  const keyExtractor = useCallback((r: Recipe) => r.id, []);

  return (
    <Screen
      title={t("header_recetas")}
      right={
        <View style={styles.headerActions}>
          <Pressable
            hitSlop={8}
            onPress={handleExportRecipebook}
            disabled={exporting}
            accessibilityLabel={t("btn_export_recipebook_pdf")}
          >
            <Ionicons name="share-outline" size={20} color={colors.terracota} />
          </Pressable>
          {canDelete ? (
            <Pressable
              onPress={() => router.push("/recetas/papelera")}
              hitSlop={8}
              accessibilityLabel={t("papelera_title")}
            >
              <Ionicons name="trash-outline" size={20} color={colors.teal} />
            </Pressable>
          ) : null}
        </View>
      }
    >
      <SectionExplainer text={t("section_explainer_recetas")} />
      {canCreate ? (
        <View style={styles.createRow}>
          <Pressable
            style={styles.createBtn}
            onPress={async () => {
              // A-12 — lazy create del sitio si todavía no hay restaurante.
              try { await ensureRestaurant(); } catch { return; }
              router.push("/recetas/nueva");
            }}
          >
            <Ionicons name="add" size={16} color={colors.paper} />
            <Text style={styles.createLabel}>{t("btn_crear_receta")}</Text>
          </Pressable>
          <Pressable
            style={styles.uploadBtn}
            onPress={async () => {
              try { await ensureRestaurant(); } catch { return; }
              router.push("/recetas/cargar");
            }}
          >
            <Ionicons name="cloud-upload-outline" size={16} color={colors.terracota} />
            <Text style={styles.uploadLabel}>{t("btn_cargar_receta")}</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={styles.searchRow}>
        <Ionicons name="search" size={16} color={colors.mute} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder={t("recetas_search_placeholder")}
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
        data={recipes}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.listContent}
        style={styles.listScroll}
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
          ) : (
            <Empty
              icon="book-outline"
              title={
                filter === "in_progress" || filter === "all"
                  ? t("empty_recetas_title")
                  : t("empty_recetas_filter")
              }
              sub={filter === "in_progress" || filter === "all" ? t("empty_recetas_sub") : undefined}
            />
          )
        }
      />

      <ConfirmSheet
        open={!!pendingDelete}
        title={t("confirm_delete_recipe_title")}
        body={t("confirm_delete_recipe_body")}
        confirmLabel={t("confirm_delete")}
        cancelLabel={t("confirm_cancel")}
        destructive
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </Screen>
  );
}

// Card memoizada. Props se mantienen referencialmente estables desde el padre
// (useCallback + t estable de useI18n), así un keystroke en el search no
// re-renderiza las 50 cards — solo el ítem que realmente cambió.
// C-06a: cents → "€3.20" (formato chico para card; sin separador de miles
// porque los precios de plato/coste por porción no llegan a 4 cifras).
function formatEuroFromCents(cents: number): string {
  return formatEuros(cents);
}

type RecipeCardTFn = (
  key:
    | "state_draft"
    | "state_in_test"
    | "state_approved"
    | "recetas_card_cost_label"
    | "recetas_card_pvp_label",
) => string;

const RecipeCard = memo(function RecipeCard({
  item,
  canDelete,
  onPress,
  onDelete,
  t,
}: {
  item: Recipe;
  canDelete: boolean;
  onPress: (id: string) => void;
  onDelete: (r: Recipe) => void;
  t: RecipeCardTFn;
}) {
  // C-06a — solo renderizamos la línea si hay al menos un dato. Si no hay
  // coste computable ni PVP, no ensuciamos la card con "—".
  const hasCost = item.perPortionCents != null;
  const hasPvp = item.salePrice != null;
  return (
    <Pressable style={styles.recipeCard} onPress={() => onPress(item.id)}>
      <View style={{ flex: 1 }}>
        <Text style={styles.recipeTitle}>{item.title}</Text>
        <View style={styles.metaRow}>
          <StateChip state={item.state} t={t} />
          {item.priority ? (
            <View style={styles.priorityChip}>
              <Ionicons name="star" size={10} color={colors.terracota} />
              <Text style={styles.priorityLabel}>★</Text>
            </View>
          ) : null}
          <Text style={styles.author}>{item.authorName}</Text>
        </View>
        {hasCost || hasPvp ? (
          <View style={styles.priceRow}>
            {hasCost ? (
              <Text style={styles.priceCost}>
                {t("recetas_card_cost_label")} {formatEuroFromCents(item.perPortionCents!)}
              </Text>
            ) : null}
            {hasCost && hasPvp ? <Text style={styles.priceSep}> · </Text> : null}
            {hasPvp ? (
              <Text style={styles.pricePvp}>
                {t("recetas_card_pvp_label")} {formatEuroFromCents(item.salePrice!)}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
      {canDelete ? (
        <Pressable hitSlop={10} onPress={() => onDelete(item)}>
          <Ionicons name="trash-outline" size={18} color={colors.mute} />
        </Pressable>
      ) : null}
    </Pressable>
  );
});

function StateChip({
  state,
  t,
}: {
  state: Recipe["state"];
  t: (key: "state_draft" | "state_in_test" | "state_approved") => string;
}) {
  const map = {
    draft: { label: t("state_draft"), bg: colors.paperWarm, color: colors.inkSoft },
    in_test: { label: t("state_in_test"), bg: colors.tealSoft, color: colors.teal },
    approved: { label: t("state_approved"), bg: colors.terracotaSoft, color: colors.terracota },
  } as const;
  const s = map[state];
  return (
    <View style={[styles.chip, { backgroundColor: s.bg }]}>
      <Text style={[styles.chipLabel, { color: s.color }]}>{s.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  createRow: {
    flexDirection: "row",
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
  // Bloque 4 · C-03 — par Crear (terracota) + Cargar (teal) siguiendo el
  // patrón EDITAR/PDF de Menús: ambas solid, secondary en tealSoft + paper.
  uploadBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.tealSoft,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 4,
  },
  uploadLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.paper,
    fontWeight: "600",
    letterSpacing: 0.8,
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
  // El ScrollView horizontal en sí mismo no debe expandirse verticalmente —
  // sin esto, RN le da `flex: 1` implícito en algunos layouts y los items
  // adentro (que defaultean a alignItems: stretch en cross-axis vertical) se
  // estiran a 400+ px de alto. flexGrow/Shrink: 0 + alignItems en el content
  // mantienen los pills a la altura natural del texto + padding.
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
  // El ScrollView de la lista sí toma el espacio restante (con flex: 1) para
  // que pueda hacer scroll y no se mezcle con los tabs.
  listScroll: { flex: 1 },
  listContent: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.sm },
  recipeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.paperSoft,
    borderRadius: radii.md,
    borderWidth: 0.5,
    borderColor: colors.edge,
    padding: spacing.md,
  },
  recipeTitle: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSizes.serifBody,
    color: colors.ink,
  },
  metaRow: { flexDirection: "row", gap: spacing.xs, alignItems: "center", marginTop: spacing.xs },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  chipLabel: { fontFamily: fonts.sans, fontSize: 10.5, fontWeight: "600", letterSpacing: 0.6 },
  priorityChip: { flexDirection: "row", alignItems: "center", gap: 2 },
  priorityLabel: { color: colors.terracota, fontFamily: fonts.sans, fontSize: 10 },
  author: { fontFamily: fonts.sans, fontSize: fontSizes.caption, color: colors.mute },
  // C-06a — línea de coste/PVP debajo de chips. Coste mute (info derivada),
  // PVP destacado en ink + bold (es la decisión del chef).
  priceRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  priceCost: { fontFamily: fonts.sans, fontSize: fontSizes.caption, color: colors.mute },
  priceSep: { fontFamily: fonts.sans, fontSize: fontSizes.caption, color: colors.mute },
  pricePvp: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.ink,
    fontWeight: "600",
  },
});
