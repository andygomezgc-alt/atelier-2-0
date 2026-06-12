// Cargar receta desde archivo (PDF o DOCX).
// Flow:
//  1. DocumentPicker abre el picker nativo. En Android, ese picker incluye a
//     Google Drive como proveedor "out of the box" gracias al Storage Access
//     Framework — no necesitamos OAuth con Drive en v1.
//  2. Subimos el archivo a /api/recipes/upload. El server extrae texto + lo
//     estructura con Claude.
//  3. Guardamos la extracción en `recipe-draft` y navegamos a /recetas/nueva
//     para que el usuario revise y guarde.

import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { useRouter } from "expo-router";
import { Screen } from "@/src/components/Screen";
import { Button } from "@/src/components/Button";
import { useI18n } from "@/src/hooks/useI18n";
import { useAuth } from "@/src/hooks/useAuth";
import { uploadRecipeFile } from "@/src/api/recipes";
import { apiErrorMessage } from "@/src/lib/api-error";
import { setRecipeDraft } from "@/src/lib/recipe-draft";
import { showToast } from "@/src/components/Toast";
import { can } from "@atelier/shared";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

const PDF_MIME = "application/pdf";
const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
// Including the Google Docs MIME makes Drive show native Google Docs as
// pickable in the Android system picker. Drive auto-exports the chosen Doc
// to one of the formats we list (PDF or DOCX), so the server still receives
// a normal file — we don't need to handle the Google Docs MIME ourselves.
const GDOC_MIME = "application/vnd.google-apps.document";

export default function CargarRecetaScreen() {
  const { t } = useI18n();
  const { state: authState } = useAuth();
  const router = useRouter();
  const [processing, setProcessing] = useState(false);

  const role =
    authState.status === "signed-in" || authState.status === "needs-restaurant"
      ? authState.user.role
      : "viewer";
  const canEdit = can(role, "edit_recipe");

  async function pickAndUpload() {
    if (processing) return;
    const result = await DocumentPicker.getDocumentAsync({
      type: [PDF_MIME, DOCX_MIME, GDOC_MIME],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;

    const inferredMime =
      asset.mimeType ??
      (asset.name?.toLowerCase().endsWith(".pdf")
        ? PDF_MIME
        : asset.name?.toLowerCase().endsWith(".docx")
          ? DOCX_MIME
          : "application/octet-stream");

    setProcessing(true);
    try {
      const extracted = await uploadRecipeFile(asset.uri, inferredMime);
      // Pasamos a nueva.tsx: contentJson (legacy compat), recipeIngredients
      // (estructurado, productIds pre-set para exact matches), y
      // pendingMatches (probables que el chef confirma al abrir el form).
      setRecipeDraft({
        title: extracted.title,
        contentJson: extracted.contentJson,
        recipeIngredients: extracted.recipeIngredients,
        pendingMatches: extracted.pendingMatches,
      });
      showToast(t("toast_recipe_uploaded"));
      router.replace("/recetas/nueva");
    } catch (err) {
      // NetworkError lleva codes internos ("network_unreachable") que no son
      // para humanos — apiErrorMessage los traduce.
      showToast(apiErrorMessage(err, t));
    } finally {
      setProcessing(false);
    }
  }

  if (!canEdit) {
    return (
      <Screen title={t("recetas_cargar_title")} back onBack={() => router.back()}>
        <View style={{ padding: spacing.xl }}>
          <Text style={{ color: colors.mute, fontFamily: fonts.sans }}>
            {t("error_network")}
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen title={t("recetas_cargar_title")} back onBack={() => router.back()}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Ionicons name="document-text-outline" size={56} color={colors.terracota} />
          <Text style={styles.title}>{t("recetas_cargar_title")}</Text>
          <Text style={styles.hint}>{t("recetas_cargar_hint")}</Text>
        </View>

        {processing ? (
          <View style={styles.processingCard}>
            <ActivityIndicator color={colors.terracota} />
            <Text style={styles.processingLabel}>{t("recetas_cargar_processing")}</Text>
          </View>
        ) : (
          <Button
            label={t("recetas_cargar_pick")}
            iconLeft="cloud-upload-outline"
            onPress={pickAndUpload}
          />
        )}

        <Pressable
          onPress={() => router.replace("/recetas/nueva")}
          style={styles.skipBtn}
          disabled={processing}
        >
          <Text style={styles.skipLabel}>{t("btn_crear_receta")}</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xxl,
    gap: spacing.xl,
  },
  hero: { alignItems: "center", gap: spacing.sm },
  title: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSizes.serifLg,
    color: colors.ink,
    textAlign: "center",
  },
  hint: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.mute,
    textAlign: "center",
    paddingHorizontal: spacing.lg,
  },
  processingCard: {
    backgroundColor: colors.paperSoft,
    borderRadius: radii.md,
    borderWidth: 0.5,
    borderColor: colors.edge,
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.sm,
  },
  processingLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.inkSoft,
  },
  skipBtn: {
    alignSelf: "center",
    paddingVertical: spacing.sm,
  },
  skipLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.terracota,
    textDecorationLine: "underline",
  },
});
