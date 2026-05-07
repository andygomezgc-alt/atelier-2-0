import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { Screen } from "@/src/components/Screen";
import { Empty } from "@/src/components/Empty";
import { useI18n } from "@/src/hooks/useI18n";
import { listMenus, type Menu } from "@/src/api/menus";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

export default function MenusScreen() {
  const { t } = useI18n();
  const router = useRouter();

  const [menus, setMenus] = useState<Menu[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <Screen title={t("header_menus")}>
      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <ActivityIndicator color={colors.terracota} style={{ marginTop: spacing.xl }} />
        ) : menus.length === 0 ? (
          <Empty icon="list-outline" title={t("empty_menus_title")} sub={t("empty_menus_sub")} />
        ) : (
          menus.map((m) => (
            <Pressable
              key={m.id}
              style={styles.card}
              onPress={() => router.push({ pathname: "/menus/[id]", params: { id: m.id } })}
            >
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.title}>{m.name}</Text>
                {m.season ? <Text style={styles.season}>{m.season}</Text> : null}
                <Text style={styles.count}>
                  {m.itemCount} {m.itemCount === 1 ? "plato" : "platos"}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.mute} />
            </Pressable>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
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
});
