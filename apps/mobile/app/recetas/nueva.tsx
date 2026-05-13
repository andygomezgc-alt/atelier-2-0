// Crear / revisar receta. Usado en dos modos:
//  - Crear desde cero: pantalla en blanco.
//  - Revisar tras carga de PDF/DOCX: cargar.tsx deja la extracción en
//    `recipe-draft` antes de navegar acá; consumimos esa "memoria" al montar.

import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Screen } from "@/src/components/Screen";
import { Eyebrow } from "@/src/components/Eyebrow";
import { Button } from "@/src/components/Button";
import { useI18n } from "@/src/hooks/useI18n";
import { useAuth } from "@/src/hooks/useAuth";
import { createRecipe, patchRecipe } from "@/src/api/recipes";
import { showToast } from "@/src/components/Toast";
import { consumeRecipeDraft } from "@/src/lib/recipe-draft";
import { can } from "@atelier/shared";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

export default function NuevaRecetaScreen() {
  const { t } = useI18n();
  const { state: authState } = useAuth();
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [ingredients, setIngredients] = useState<string[]>([""]);
  const [method, setMethod] = useState<string[]>([""]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  // null = create, string id = edit (PATCH instead of POST).
  const [editId, setEditId] = useState<string | null>(null);

  // Pre-fill from upload extraction or "Modificar receta" button.
  useEffect(() => {
    const draft = consumeRecipeDraft();
    if (!draft) return;
    setTitle(draft.title);
    setIngredients(draft.contentJson.ingredients.length ? draft.contentJson.ingredients : [""]);
    setMethod(draft.contentJson.method.length ? draft.contentJson.method : [""]);
    setNotes(draft.contentJson.notes ?? "");
    if (draft.editId) setEditId(draft.editId);
  }, []);

  const role =
    authState.status === "signed-in" || authState.status === "needs-restaurant"
      ? authState.user.role
      : "viewer";
  const canEdit = can(role, "edit_recipe");

  async function handleSave() {
    if (saving) return;
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    setSaving(true);
    const payload = {
      title: cleanTitle,
      contentJson: {
        ingredients: ingredients.map((i) => i.trim()).filter(Boolean),
        method: method.map((m) => m.trim()).filter(Boolean),
        notes: notes.trim(),
      },
    };
    try {
      if (editId) {
        await patchRecipe(editId, payload);
        showToast(t("toast_recipe_saved"));
        router.replace({ pathname: "/recetas/[id]", params: { id: editId } });
      } else {
        await createRecipe(payload);
        showToast(t("toast_recipe_saved"));
        router.replace("/(tabs)/recetas");
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("error_network"));
    } finally {
      setSaving(false);
    }
  }

  if (!canEdit) {
    return (
      <Screen title={t("recetas_nueva_title")} back onBack={() => router.back()}>
        <View style={{ padding: spacing.xl }}>
          <Text style={{ color: colors.mute, fontFamily: fonts.sans }}>
            {t("error_network")}
          </Text>
        </View>
      </Screen>
    );
  }

  const screenTitle = editId ? t("recipe_editar_title") : t("recetas_nueva_title");

  return (
    <Screen title={screenTitle} back onBack={() => router.back()}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View>
            <Eyebrow>{t("recetas_form_title_label")}</Eyebrow>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder={t("recetas_form_title_placeholder")}
              placeholderTextColor={colors.mute}
              style={styles.titleInput}
              multiline
              scrollEnabled={false}
              textAlignVertical="top"
            />
          </View>

          <View>
            <Eyebrow>{t("section_ingredients")}</Eyebrow>
            {ingredients.map((it, idx) => (
              <View key={idx} style={styles.row}>
                <TextInput
                  value={it}
                  onChangeText={(v) =>
                    setIngredients((prev) => prev.map((p, i) => (i === idx ? v : p)))
                  }
                  placeholder={t("recetas_form_ingredient_placeholder")}
                  placeholderTextColor={colors.mute}
                  style={styles.lineInput}
                  multiline
                />
                <Pressable
                  hitSlop={8}
                  onPress={() =>
                    setIngredients((prev) =>
                      prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev,
                    )
                  }
                >
                  <Ionicons name="close-circle-outline" size={20} color={colors.mute} />
                </Pressable>
              </View>
            ))}
            <Pressable
              style={styles.addBtn}
              onPress={() => setIngredients((prev) => [...prev, ""])}
            >
              <Ionicons name="add" size={16} color={colors.terracota} />
              <Text style={styles.addLabel}>{t("recetas_form_add_ingredient")}</Text>
            </Pressable>
          </View>

          <View>
            <Eyebrow>{t("section_method")}</Eyebrow>
            {method.map((it, idx) => (
              <View key={idx} style={styles.row}>
                <Text style={styles.step}>{idx + 1}.</Text>
                <TextInput
                  value={it}
                  onChangeText={(v) =>
                    setMethod((prev) => prev.map((p, i) => (i === idx ? v : p)))
                  }
                  placeholder={t("recetas_form_step_placeholder")}
                  placeholderTextColor={colors.mute}
                  style={styles.lineInput}
                  multiline
                />
                <Pressable
                  hitSlop={8}
                  onPress={() =>
                    setMethod((prev) =>
                      prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev,
                    )
                  }
                >
                  <Ionicons name="close-circle-outline" size={20} color={colors.mute} />
                </Pressable>
              </View>
            ))}
            <Pressable
              style={styles.addBtn}
              onPress={() => setMethod((prev) => [...prev, ""])}
            >
              <Ionicons name="add" size={16} color={colors.terracota} />
              <Text style={styles.addLabel}>{t("recetas_form_add_step")}</Text>
            </Pressable>
          </View>

          <View>
            <Eyebrow>{t("section_note")}</Eyebrow>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder={t("recetas_form_notes_placeholder")}
              placeholderTextColor={colors.mute}
              style={styles.notesInput}
              multiline
            />
          </View>

          <Button
            label={saving ? "…" : t("btn_save")}
            onPress={handleSave}
            disabled={!title.trim() || saving}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.xl,
  },
  titleInput: {
    marginTop: spacing.sm,
    fontFamily: fonts.serif,
    fontStyle: "italic",
    fontSize: fontSizes.serifLg,
    lineHeight: fontSizes.serifLg * 1.25,
    color: colors.ink,
    backgroundColor: colors.paperSoft,
    borderRadius: radii.md,
    padding: spacing.md,
    borderWidth: 0.5,
    borderColor: colors.edge,
    minHeight: 72,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  step: {
    fontFamily: fonts.serif,
    fontSize: fontSizes.body,
    color: colors.terracota,
    paddingTop: spacing.sm + 4,
    minWidth: 22,
  },
  lineInput: {
    flex: 1,
    fontFamily: fonts.serif,
    fontSize: fontSizes.body,
    color: colors.ink,
    backgroundColor: colors.paperSoft,
    borderRadius: radii.sm,
    padding: spacing.sm,
    borderWidth: 0.5,
    borderColor: colors.edge,
    minHeight: 40,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  addLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.terracota,
    fontWeight: "600",
  },
  notesInput: {
    marginTop: spacing.sm,
    fontFamily: fonts.serif,
    fontSize: fontSizes.body,
    color: colors.ink,
    backgroundColor: colors.paperSoft,
    borderRadius: radii.md,
    padding: spacing.md,
    borderWidth: 0.5,
    borderColor: colors.edge,
    minHeight: 100,
    textAlignVertical: "top",
  },
});
