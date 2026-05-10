import { useEffect, useState } from "react";
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
import { useI18n } from "@/src/hooks/useI18n";
import { listMenus, createMenu, addMenuItem, type Menu } from "@/src/api/menus";
import { showToast } from "./Toast";
import { Button } from "./Button";
import { BottomSheet } from "./BottomSheet";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

type Props = {
  open: boolean;
  recipeId: string;
  onClose: () => void;
};

const DEFAULT_PRICE_CENTS = 2800;

export function AddToMenuSheet({ open, recipeId, onClose }: Props) {
  const { t } = useI18n();
  const [menus, setMenus] = useState<Menu[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSeason, setNewSeason] = useState("");

  useEffect(() => {
    if (!open) return;
    setShowCreate(false);
    setNewName("");
    setNewSeason("");
    setLoading(true);
    listMenus()
      .then(setMenus)
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [open]);

  async function handleAdd(menu: Menu) {
    try {
      await addMenuItem(menu.id, { recipeId, price: DEFAULT_PRICE_CENTS });
      showToast(t("toast_added_to_menu"));
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("error_network"));
    }
  }

  async function handleCreateAndAdd() {
    if (!newName.trim() || creating) return;
    setCreating(true);
    try {
      const menu = await createMenu({
        name: newName.trim(),
        season: newSeason.trim() || undefined,
      });
      await addMenuItem(menu.id, { recipeId, price: DEFAULT_PRICE_CENTS });
      showToast(t("toast_added_to_menu"));
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("error_network"));
      setCreating(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
        <Text style={styles.title}>{t("btn_add_to_menu")}</Text>

        {showCreate ? (
          <View style={styles.createBox}>
            <TextInput
              value={newName}
              onChangeText={setNewName}
              placeholder={t("onboard_create_name_label")}
              placeholderTextColor={colors.mute}
              style={styles.input}
              maxLength={120}
            />
            <TextInput
              value={newSeason}
              onChangeText={setNewSeason}
              placeholder={t("add_to_menu_season_placeholder")}
              placeholderTextColor={colors.mute}
              style={styles.input}
              maxLength={60}
            />
            <View style={styles.createActions}>
              <Button
                label={t("confirm_cancel")}
                variant="ghost"
                onPress={() => setShowCreate(false)}
              />
              <Button
                label={creating ? "…" : t("btn_crear_menu")}
                disabled={!newName.trim() || creating}
                onPress={handleCreateAndAdd}
              />
            </View>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.list}>
            {loading ? (
              <ActivityIndicator color={colors.terracota} />
            ) : (
              <>
                {menus.map((m) => (
                  <Pressable key={m.id} style={styles.menuRow} onPress={() => handleAdd(m)}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.menuName}>{m.name}</Text>
                      {m.season ? <Text style={styles.menuMeta}>{m.season}</Text> : null}
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.mute} />
                  </Pressable>
                ))}
                <Pressable style={styles.createRow} onPress={() => setShowCreate(true)}>
                  <Ionicons name="add-circle-outline" size={18} color={colors.terracota} />
                  <Text style={styles.createLabel}>{t("btn_crear_menu")}</Text>
                </Pressable>
              </>
            )}
          </ScrollView>
        )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: fonts.serif,
    fontStyle: "italic",
    fontSize: fontSizes.serifLg,
    color: colors.ink,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  list: { paddingHorizontal: spacing.xl, gap: spacing.xs, paddingBottom: spacing.xl },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.paper,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderWidth: 0.5,
    borderColor: colors.edge,
  },
  menuName: { fontFamily: fonts.serif, fontStyle: "italic", fontSize: fontSizes.body, color: colors.ink },
  menuMeta: { fontFamily: fonts.sans, fontSize: fontSizes.caption, color: colors.mute, marginTop: 2 },
  createRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.terracota,
    marginTop: spacing.sm,
  },
  createLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.body,
    color: colors.terracota,
    fontWeight: "600",
  },
  createBox: { paddingHorizontal: spacing.xl, gap: spacing.sm },
  input: {
    backgroundColor: colors.paper,
    borderWidth: 0.5,
    borderColor: colors.edge,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontFamily: fonts.sans,
    fontSize: fontSizes.body,
    color: colors.ink,
  },
  createActions: { flexDirection: "row", gap: spacing.sm, justifyContent: "flex-end", marginTop: spacing.sm },
});
