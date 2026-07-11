import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Screen } from "@/src/components/Screen";
import { Empty } from "@/src/components/Empty";
import { Button } from "@/src/components/Button";
import { showToast } from "@/src/components/Toast";
import { useI18n } from "@/src/hooks/useI18n";
import { listProducts, restoreProduct, type Product } from "@/src/api/products";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

// Papelera de productos (auditoría jul 2026): el borrado es soft-delete, así
// que acá el chef recupera lo que borró por error.
export default function PapeleraProductosScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listProducts({ trash: true }));
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("error_network"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const handleRestore = useCallback(
    async (id: string) => {
      if (restoringId) return;
      setRestoringId(id);
      try {
        await restoreProduct(id);
        showToast(t("toast_product_restored"));
        setItems((prev) => prev.filter((p) => p.id !== id));
      } catch (err) {
        showToast(err instanceof Error ? err.message : t("error_network"));
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
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.content}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.title} numberOfLines={2}>
              {item.name}
            </Text>
            <Button
              label={t("btn_restaurar")}
              variant="secondary"
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
              sub={t("papelera_productos_empty_sub")}
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
