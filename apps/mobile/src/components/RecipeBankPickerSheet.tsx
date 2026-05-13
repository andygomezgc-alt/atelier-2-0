// Sheet "Desde el banco": lista de recetas aprobadas del restaurante para
// agregarlas como plato a una sección específica de un menú.
//
// El prototipo desktop muestra esto como un <select> inline dentro de la
// sección. En móvil usamos un sheet — abre desde un "+" en el footer de la
// sección. Tap a una receta → POST /api/menus/[id]/items con recipeId +
// sectionId, después cierra.

import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useI18n } from "@/src/hooks/useI18n";
import { listRecipes, type Recipe } from "@/src/api/recipes";
import { Empty } from "./Empty";
import { BottomSheet } from "./BottomSheet";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

type Props = {
  open: boolean;
  /** Recipe IDs already on this menu — we mark them as "ya agregada". */
  alreadyOnMenu: ReadonlyArray<string>;
  onClose: () => void;
  onPick: (recipeId: string) => void;
};

export function RecipeBankPickerSheet({
  open,
  alreadyOnMenu,
  onClose,
  onPick,
}: Props) {
  const { t } = useI18n();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    listRecipes({ state: "approved" })
      .then(setRecipes)
      .catch(() => setRecipes([]))
      .finally(() => setLoading(false));
  }, [open]);

  return (
    <BottomSheet open={open} onClose={onClose}>
      <Text style={styles.title}>{t("recipe_bank_title")}</Text>
      <Text style={styles.subtitle}>{t("recipe_bank_subtitle")}</Text>
      <ScrollView contentContainerStyle={styles.list}>
        {loading ? (
          <ActivityIndicator color={colors.terracota} style={{ marginTop: spacing.xl }} />
        ) : recipes.length === 0 ? (
          <Empty
            icon="book-outline"
            title={t("recipe_bank_empty_title")}
            sub={t("recipe_bank_empty_sub")}
          />
        ) : (
          recipes.map((r) => {
            const already = alreadyOnMenu.includes(r.id);
            return (
              <Pressable
                key={r.id}
                style={[styles.row, already && styles.rowDisabled]}
                onPress={() => {
                  if (already) return;
                  onPick(r.id);
                  onClose();
                }}
                disabled={already}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{r.title}</Text>
                  <Text style={styles.meta}>
                    {r.authorName} · {already ? t("recipe_bank_already") : t("state_approved")}
                  </Text>
                </View>
                {already ? (
                  <Ionicons name="checkmark" size={18} color={colors.mute} />
                ) : (
                  <Ionicons name="add-circle-outline" size={20} color={colors.terracota} />
                )}
              </Pressable>
            );
          })
        )}
      </ScrollView>
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
  },
  subtitle: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.mute,
    paddingHorizontal: spacing.xl,
    marginTop: 2,
    marginBottom: spacing.md,
  },
  list: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    gap: spacing.xs,
  },
  row: {
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
  rowDisabled: { opacity: 0.5 },
  name: {
    fontFamily: fonts.serif,
    fontStyle: "italic",
    fontSize: fontSizes.body,
    color: colors.ink,
  },
  meta: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.mute,
    marginTop: 2,
    letterSpacing: 0.4,
  },
});
