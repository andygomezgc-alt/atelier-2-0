import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Screen } from "@/src/components/Screen";
import { Empty } from "@/src/components/Empty";
import { Button } from "@/src/components/Button";
import { showToast } from "@/src/components/Toast";
import { useI18n } from "@/src/hooks/useI18n";
import { useRefresh } from "@/src/hooks/useRefresh";
import { listRecipes, restoreRecipe, type Recipe } from "@/src/api/recipes";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";
import { apiErrorMessage } from "@/src/lib/api-error";

// Papelera de recetas (auditoría jul 2026): el borrado es soft-delete, así que
// acá el chef recupera lo que borró por error.
export default function PapeleraScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const [items, setItems] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const reload = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      setItems(await listRecipes({ trash: true }));
    } catch (err) {
      showToast(apiErrorMessage(err, t));
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const silentReload = useCallback(() => reload({ silent: true }), [reload]);
  const { refreshing, onRefresh } = useRefresh(["recipes:"], silentReload);

  const handleRestore = useCallback(
    async (id: string) => {
      if (restoringId) return;
      setRestoringId(id);
      try {
        await restoreRecipe(id);
        showToast(t("toast_recipe_restored"));
        setItems((prev) => prev.filter((r) => r.id !== id));
      } catch (err) {
        showToast(apiErrorMessage(err, t));
      } finally {
        setRestoringId(null);
      }
    },
    [restoringId, t],
  );

  return (
    <Screen title={t("papelera_title")} back onBack={() => router.back()}>
      <FlatList
        data={items}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.terracota}
            colors={[colors.terracota]}
            progressBackgroundColor={colors.paper}
          />
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.title} numberOfLines={2}>
              {item.title}
            </Text>
            <Button
              label={t("btn_restaurar")}
              variant="secondary"
              disabled={restoringId === item.id}
              onPress={() => handleRestore(item.id)}
            />
          </View>
        )}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={colors.terracota} style={{ marginTop: spacing.xl }} />
          ) : (
            <Empty
              icon="trash-outline"
              title={t("papelera_empty_title")}
              sub={t("papelera_empty_sub")}
            />
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.paperSoft,
    borderRadius: radii.md,
    borderWidth: 0.5,
    borderColor: colors.edge,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  title: { flex: 1, fontFamily: fonts.serif, fontSize: fontSizes.serifBody, color: colors.ink },
});
