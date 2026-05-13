import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/src/components/Screen";
import { Eyebrow } from "@/src/components/Eyebrow";
import { Button } from "@/src/components/Button";
import { useI18n } from "@/src/hooks/useI18n";
import { useAuth } from "@/src/hooks/useAuth";
import { getRecipe, patchRecipe, type RecipeFull } from "@/src/api/recipes";
import { showToast } from "@/src/components/Toast";
import { AddToMenuSheet } from "@/src/components/AddToMenuSheet";
import { setRecipeDraft } from "@/src/lib/recipe-draft";
import { can } from "@atelier/shared";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useI18n();
  const { state: authState } = useAuth();
  const router = useRouter();

  const [recipe, setRecipe] = useState<RecipeFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [addToMenuOpen, setAddToMenuOpen] = useState(false);

  const role =
    authState.status === "signed-in" || authState.status === "needs-restaurant"
      ? authState.user.role
      : "viewer";

  const reload = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const r = await getRecipe(id);
      setRecipe(r);
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("error_network"));
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function togglePriority() {
    if (!recipe) return;
    try {
      const updated = await patchRecipe(recipe.id, { priority: !recipe.priority });
      setRecipe(updated);
      showToast(updated.priority ? t("toast_priority_on") : t("toast_priority_off"));
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("error_network"));
    }
  }

  async function advanceToTest() {
    if (!recipe) return;
    try {
      const updated = await patchRecipe(recipe.id, { state: "in_test" });
      setRecipe(updated);
      showToast(t("toast_advanced_to_test"));
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("error_network"));
    }
  }

  async function approve() {
    if (!recipe) return;
    try {
      const updated = await patchRecipe(recipe.id, { state: "approved" });
      setRecipe(updated);
      showToast(t("toast_approved"));
      // 600ms delay matches the prototype micro-interaction
      setTimeout(() => setAddToMenuOpen(true), 600);
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("error_network"));
    }
  }

  function openEditor() {
    if (!recipe) return;
    setRecipeDraft({
      title: recipe.title,
      contentJson: recipe.contentJson,
      editId: recipe.id,
    });
    router.push("/recetas/nueva");
  }

  if (loading || !recipe) {
    return (
      <Screen title={t("header_receta")} back onBack={() => router.back()}>
        <ActivityIndicator color={colors.terracota} style={{ marginTop: spacing.xxl }} />
      </Screen>
    );
  }

  const content = recipe.contentJson;
  const canEdit = can(role, "edit_recipe");
  // Approved recipes are admin-only to modify — the team has signed off and
  // editing the content requires a stricter sign-off than edit_recipe.
  const canModify =
    recipe.state === "approved" ? role === "admin" : canEdit;

  return (
    <Screen title={t("header_receta")} back onBack={() => router.back()}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <StateLabel state={recipe.state} t={t} />
            {recipe.priority ? (
              <Ionicons name="star" size={16} color={colors.terracota} />
            ) : null}
          </View>
          <Text style={styles.title}>{recipe.title}</Text>
          <Text style={styles.author}>
            {recipe.authorName} · v{recipe.version}
          </Text>
        </View>

        {recipe.state === "approved" ? (
          <View style={styles.menusSection}>
            <Eyebrow>{t("recipe_in_menus")}</Eyebrow>
            {recipe.menus.length === 0 ? (
              <Text style={styles.menuEmpty}>{t("recipe_in_no_menus")}</Text>
            ) : (
              <View style={styles.menuChips}>
                {recipe.menus.map((m) => (
                  <Pressable
                    key={m.id}
                    style={styles.menuChip}
                    onPress={() => router.push({ pathname: "/menus/[id]", params: { id: m.id } })}
                  >
                    <Ionicons name="restaurant-outline" size={12} color={colors.terracota} />
                    <Text style={styles.menuChipLabel}>{m.name}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        ) : null}

        {content.ingredients.length > 0 ? (
          <View style={styles.section}>
            <Eyebrow>{t("section_ingredients")}</Eyebrow>
            {content.ingredients.map((it, idx) => (
              <Text key={idx} style={styles.bullet}>
                · {it}
              </Text>
            ))}
          </View>
        ) : null}

        {content.method.length > 0 ? (
          <View style={styles.section}>
            <Eyebrow>{t("section_method")}</Eyebrow>
            {content.method.map((it, idx) => (
              <Text key={idx} style={styles.numbered}>
                {idx + 1}. {it}
              </Text>
            ))}
          </View>
        ) : null}

        {content.notes ? (
          <View style={styles.section}>
            <Eyebrow>{t("section_note")}</Eyebrow>
            <Text style={styles.note}>{content.notes}</Text>
          </View>
        ) : null}

        <View style={styles.actions}>
          {canModify ? (
            <Button
              label={t("btn_modificar")}
              iconLeft="pencil"
              variant="secondary"
              onPress={openEditor}
            />
          ) : null}
          {recipe.state === "draft" && can(role, "advance_to_test") ? (
            <Button label={t("btn_advance_to_test")} onPress={advanceToTest} />
          ) : null}
          {recipe.state === "in_test" && can(role, "approve_recipe") ? (
            <Button label={t("btn_approve")} onPress={approve} />
          ) : null}
          {recipe.state === "approved" ? (
            <Button
              label={t("btn_add_to_menu")}
              variant="secondary"
              onPress={() => setAddToMenuOpen(true)}
            />
          ) : null}
          {canEdit ? (
            <Button
              label={recipe.priority ? t("btn_priority_off") : t("btn_priority_on")}
              variant="ghost"
              onPress={togglePriority}
            />
          ) : null}
        </View>
      </ScrollView>

      <AddToMenuSheet
        open={addToMenuOpen}
        recipeId={recipe.id}
        onClose={() => setAddToMenuOpen(false)}
      />
    </Screen>
  );
}

function StateLabel({
  state,
  t,
}: {
  state: RecipeFull["state"];
  t: (key: "state_draft" | "state_in_test" | "state_approved") => string;
}) {
  const map = {
    draft: { label: t("state_draft"), color: colors.inkSoft },
    in_test: { label: t("state_in_test"), color: colors.teal },
    approved: { label: t("state_approved"), color: colors.terracota },
  } as const;
  return <Text style={[styles.stateLabel, { color: map[state].color }]}>{map[state].label}</Text>;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.xl, paddingVertical: spacing.xl, gap: spacing.xl },
  hero: { gap: spacing.xs },
  heroTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  stateLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.eyebrow,
    textTransform: "uppercase",
    letterSpacing: 1.4,
    fontWeight: "600",
  },
  title: {
    fontFamily: fonts.serif,
    fontStyle: "italic",
    fontSize: fontSizes.serifDisplay,
    color: colors.ink,
    lineHeight: fontSizes.serifDisplay * 1.15,
  },
  author: { fontFamily: fonts.sans, fontSize: fontSizes.bodySm, color: colors.mute },
  section: {
    backgroundColor: colors.paperSoft,
    borderRadius: radii.md,
    borderWidth: 0.5,
    borderColor: colors.edge,
    padding: spacing.md,
    gap: spacing.xs,
  },
  bullet: { fontFamily: fonts.serif, fontSize: fontSizes.body, color: colors.ink, lineHeight: fontSizes.body * 1.5 },
  numbered: {
    fontFamily: fonts.serif,
    fontSize: fontSizes.body,
    color: colors.ink,
    lineHeight: fontSizes.body * 1.5,
  },
  note: {
    fontFamily: fonts.serif,
    fontStyle: "italic",
    fontSize: fontSizes.body,
    color: colors.inkSoft,
    lineHeight: fontSizes.body * 1.5,
  },
  actions: { gap: spacing.sm },
  menusSection: { gap: spacing.xs },
  menuEmpty: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.mute,
    fontStyle: "italic",
  },
  menuChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  menuChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.paperWarm,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderWidth: 0.5,
    borderColor: colors.edgeSoft,
  },
  menuChipLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.caption,
    color: colors.terracota,
    fontWeight: "600",
  },
});
