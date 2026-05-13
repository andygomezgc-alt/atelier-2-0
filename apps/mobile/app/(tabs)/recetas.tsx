import { memo, useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
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
import { useI18n } from "@/src/hooks/useI18n";
import { listRecipes, deleteRecipe, type Recipe, type ListFilters } from "@/src/api/recipes";
import { showToast } from "@/src/components/Toast";
import { useAuth } from "@/src/hooks/useAuth";
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
  const { t } = useI18n();
  const { state: authState } = useAuth();
  const router = useRouter();

  const [filter, setFilter] = useState<FilterId>("all");
  const [q, setQ] = useState("");
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<Recipe | null>(null);

  const role =
    authState.status === "signed-in" || authState.status === "needs-restaurant"
      ? authState.user.role
      : "viewer";
  const canDelete = can(role, "approve_recipe");
  const canCreate = can(role, "edit_recipe");

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
    <Screen title={t("header_recetas")}>
      {canCreate ? (
        <View style={styles.createRow}>
          <Pressable
            style={styles.createBtn}
            onPress={() => router.push("/recetas/nueva")}
          >
            <Ionicons name="add" size={16} color={colors.paper} />
            <Text style={styles.createLabel}>{t("btn_crear_receta")}</Text>
          </Pressable>
          <Pressable
            style={styles.uploadBtn}
            onPress={() => router.push("/recetas/cargar")}
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
  t: (key: "state_draft" | "state_in_test" | "state_approved") => string;
}) {
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
  uploadBtn: {
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
  uploadLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.terracota,
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
    fontFamily: fonts.serif,
    fontStyle: "italic",
    fontSize: fontSizes.body,
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
});
