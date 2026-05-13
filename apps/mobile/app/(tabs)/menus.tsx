import { memo, useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { Screen } from "@/src/components/Screen";
import { Empty } from "@/src/components/Empty";
import { ConfirmSheet } from "@/src/components/ConfirmSheet";
import { useI18n } from "@/src/hooks/useI18n";
import { useAuth } from "@/src/hooks/useAuth";
import { createMenu, listMenus, deleteMenu, type Menu } from "@/src/api/menus";
import { showToast } from "@/src/components/Toast";
import { can } from "@atelier/shared";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

export default function MenusScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const { state } = useAuth();

  const [menus, setMenus] = useState<Menu[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Menu | null>(null);

  const role =
    state.status === "signed-in" || state.status === "needs-restaurant"
      ? state.user.role
      : "viewer";
  const canCreate = can(role, "create_menu");
  const canDelete = can(role, "delete_menu");

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

  async function handleCreate() {
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      const menu = await createMenu({ name });
      setMenus((prev) => [menu, ...prev]);
      setNewName("");
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("error_network"));
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setPendingDelete(null);
    // Optimistic removal so the card disappears immediately; reload on error.
    const prev = menus;
    setMenus((m) => m.filter((x) => x.id !== id));
    try {
      await deleteMenu(id);
    } catch (err) {
      setMenus(prev);
      showToast(err instanceof Error ? err.message : t("error_network"));
    }
  }

  // Handlers estables para que MenuCard memo no se re-renderice por tipear
  // en el input de crear.
  const handleCardPress = useCallback(
    (id: string) => router.push({ pathname: "/menus/[id]", params: { id } }),
    [router],
  );
  const handleDeletePress = useCallback((m: Menu) => setPendingDelete(m), []);
  const renderItem = useCallback(
    ({ item }: { item: Menu }) => (
      <MenuCard
        item={item}
        canDelete={canDelete}
        onPress={handleCardPress}
        onDelete={handleDeletePress}
        deleteLabel={t("confirm_delete")}
      />
    ),
    [canDelete, handleCardPress, handleDeletePress, t],
  );
  const keyExtractor = useCallback((m: Menu) => m.id, []);

  const header = canCreate ? (
    <View style={styles.createBox}>
      <TextInput
        value={newName}
        onChangeText={setNewName}
        placeholder="Nombre del menú"
        placeholderTextColor={colors.mute}
        style={styles.createInput}
        onSubmitEditing={handleCreate}
        maxLength={120}
      />
      <Pressable
        onPress={handleCreate}
        disabled={!newName.trim() || creating}
        style={[
          styles.createBtn,
          (!newName.trim() || creating) && styles.createBtnDisabled,
        ]}
      >
        <Ionicons name="add" size={18} color={colors.paper} />
        <Text style={styles.createLabel}>{creating ? "…" : "Crear"}</Text>
      </Pressable>
    </View>
  ) : null;

  return (
    <Screen title={t("header_menus")}>
      <FlatList
        data={menus}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={header}
        initialNumToRender={10}
        maxToRenderPerBatch={5}
        windowSize={11}
        removeClippedSubviews
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={colors.terracota} style={{ marginTop: spacing.xl }} />
          ) : (
            <Empty icon="list-outline" title={t("empty_menus_title")} sub={t("empty_menus_sub")} />
          )
        }
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
    </Screen>
  );
}

// Card memoizada — refs estables desde el padre evitan que tipear en el input
// de crear re-renderice las 30 cards de menús.
const MenuCard = memo(function MenuCard({
  item,
  canDelete,
  onPress,
  onDelete,
  deleteLabel,
}: {
  item: Menu;
  canDelete: boolean;
  onPress: (id: string) => void;
  onDelete: (m: Menu) => void;
  deleteLabel: string;
}) {
  return (
    <Pressable style={styles.card} onPress={() => onPress(item.id)}>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={styles.title}>{item.name}</Text>
        {item.season ? <Text style={styles.season}>{item.season}</Text> : null}
        <Text style={styles.count}>
          {item.itemCount} {item.itemCount === 1 ? "plato" : "platos"}
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
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
  },
  createBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.paperSoft,
    borderRadius: radii.md,
    borderWidth: 0.5,
    borderColor: colors.edge,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  createInput: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: fontSizes.body,
    color: colors.ink,
    paddingHorizontal: spacing.sm,
  },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.terracota,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  createBtnDisabled: { opacity: 0.4 },
  createLabel: {
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
  title: {
    fontFamily: fonts.serif,
    fontStyle: "italic",
    fontSize: fontSizes.serifLg,
    color: colors.ink,
  },
  season: { fontFamily: fonts.sans, fontSize: fontSizes.bodySm, color: colors.mute },
  count: { fontFamily: fonts.sans, fontSize: fontSizes.caption, color: colors.mute, marginTop: 2 },
  deleteBtn: { padding: spacing.xs },
});
