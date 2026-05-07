import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as SecureStore from "expo-secure-store";
import { Screen } from "@/src/components/Screen";
import { Eyebrow } from "@/src/components/Eyebrow";
import { Button } from "@/src/components/Button";
import { useI18n } from "@/src/hooks/useI18n";
import { useAuth } from "@/src/hooks/useAuth";
import { getMenu, patchMenu, patchMenuItem, deleteMenuItem, type MenuFull } from "@/src/api/menus";
import { showToast } from "@/src/components/Toast";
import { TOKEN_KEY } from "@/src/api/client";
import { can, type MenuStyle } from "@atelier/shared";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

const API = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

const STYLES: ReadonlyArray<{ id: MenuStyle; labelKey: "style_elegant" | "style_rustic" | "style_minimal" }> = [
  { id: "elegant", labelKey: "style_elegant" },
  { id: "rustic", labelKey: "style_rustic" },
  { id: "minimal", labelKey: "style_minimal" },
];

function formatPrice(cents: number): string {
  return (cents / 100).toFixed(0);
}

export default function MenuDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useI18n();
  const { state: authState } = useAuth();
  const router = useRouter();

  const [menu, setMenu] = useState<MenuFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const debounce = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const role =
    authState.status === "signed-in" || authState.status === "needs-restaurant"
      ? authState.user.role
      : "viewer";
  const canEdit = can(role, "edit_menu");
  const canExport = can(role, "export_pdf");

  const reload = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      setMenu(await getMenu(id));
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("error_network"));
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleStyleChange(style: MenuStyle) {
    if (!menu) return;
    setMenu({ ...menu, presentationStyle: style });
    try {
      await patchMenu(menu.id, { presentationStyle: style });
    } catch {
      showToast(t("error_network"));
    }
  }

  function handlePriceChange(itemId: string, value: string) {
    if (!menu) return;
    const cents = Math.max(0, Math.round(parseFloat(value || "0") * 100));
    setMenu({
      ...menu,
      items: menu.items.map((it) => (it.id === itemId ? { ...it, price: cents } : it)),
    });

    if (debounce.current[itemId]) clearTimeout(debounce.current[itemId]);
    debounce.current[itemId] = setTimeout(async () => {
      try {
        await patchMenuItem(menu.id, itemId, { price: cents });
      } catch {
        showToast(t("error_network"));
      }
    }, 500);
  }

  async function handleDeleteItem(itemId: string) {
    if (!menu) return;
    setMenu({ ...menu, items: menu.items.filter((it) => it.id !== itemId) });
    try {
      await deleteMenuItem(menu.id, itemId);
    } catch {
      showToast(t("error_network"));
      void reload();
    }
  }

  async function exportPdf() {
    if (!menu || exporting) return;
    setExporting(true);
    try {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      const url = `${API}/api/menus/${menu.id}/pdf?style=${menu.presentationStyle}`;
      const fileUri = `${FileSystem.cacheDirectory}${menu.name.replace(/[^\w]/g, "_")}.pdf`;
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
  }

  if (loading || !menu) {
    return (
      <Screen title={t("header_menus")} back onBack={() => router.back()}>
        <ActivityIndicator color={colors.terracota} style={{ marginTop: spacing.xxl }} />
      </Screen>
    );
  }

  return (
    <Screen title={menu.name} back onBack={() => router.back()}>
      <ScrollView contentContainerStyle={styles.content}>
        {menu.season ? <Text style={styles.season}>{menu.season}</Text> : null}

        <View>
          <Eyebrow>{t("eyebrow_estilo")}</Eyebrow>
          <View style={styles.styleRow}>
            {STYLES.map((s) => (
              <Pressable
                key={s.id}
                style={[
                  styles.styleChip,
                  menu.presentationStyle === s.id && styles.styleChipActive,
                ]}
                onPress={() => canEdit && handleStyleChange(s.id)}
                disabled={!canEdit}
              >
                <Text
                  style={[
                    styles.styleLabel,
                    menu.presentationStyle === s.id && styles.styleLabelActive,
                  ]}
                >
                  {t(s.labelKey)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View>
          <Eyebrow>{t("section_dishes")}</Eyebrow>
          {menu.items.length === 0 ? (
            <Text style={styles.emptyText}>—</Text>
          ) : (
            menu.items.map((dish) => (
              <View key={dish.id} style={styles.dishCard}>
                <View style={styles.dishTopRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dishName}>{dish.name}</Text>
                    {dish.description ? (
                      <Text style={styles.dishDesc}>{dish.description}</Text>
                    ) : null}
                  </View>

                  <View style={styles.priceBox}>
                    <TextInput
                      value={formatPrice(dish.price)}
                      onChangeText={(v) => handlePriceChange(dish.id, v)}
                      keyboardType="numeric"
                      style={styles.priceInput}
                      editable={canEdit}
                    />
                    <Text style={styles.priceUnit}>€</Text>
                  </View>
                </View>

                <View style={styles.dishActions}>
                  {can(role, "view_staff_recipe") ? (
                    <Pressable
                      onPress={() => router.push({ pathname: "/recetas/[id]", params: { id: dish.recipeId } })}
                    >
                      <Text style={styles.linkLabel}>{t("dish_view_recipe")}</Text>
                    </Pressable>
                  ) : null}
                  {canEdit ? (
                    <Pressable hitSlop={10} onPress={() => handleDeleteItem(dish.id)}>
                      <Ionicons name="trash-outline" size={16} color={colors.mute} />
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ))
          )}
        </View>

        {canExport ? (
          <Button
            label={exporting ? "…" : t("btn_export_pdf")}
            onPress={exportPdf}
            disabled={exporting}
          />
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.xl, paddingVertical: spacing.xl, gap: spacing.xl },
  season: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.mute,
    letterSpacing: 0.5,
  },
  styleRow: { flexDirection: "row", gap: spacing.xs, marginTop: spacing.sm },
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
    fontFamily: fonts.serif,
    fontStyle: "italic",
    fontSize: fontSizes.body,
    color: colors.ink,
  },
  dishDesc: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.mute,
    marginTop: 2,
    lineHeight: fontSizes.bodySm * 1.5,
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
    fontFamily: fonts.serif,
    fontStyle: "italic",
    fontSize: fontSizes.body,
    color: colors.mute,
    marginTop: spacing.sm,
  },
});
