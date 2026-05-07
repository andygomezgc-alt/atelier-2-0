import { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/hooks/useAuth";
import { useI18n } from "@/src/hooks/useI18n";
import { apiFetch } from "@/src/api/client";
import { Button } from "@/src/components/Button";
import { showToast } from "@/src/components/Toast";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

export default function CreateRestaurantScreen() {
  const { refreshMe } = useAuth();
  const { t } = useI18n();
  const router = useRouter();

  const [name, setName] = useState("");
  const [identityLine, setIdentityLine] = useState("");
  const [loading, setLoading] = useState(false);

  const valid = name.trim().length > 0;

  async function handleCreate() {
    if (!valid || loading) return;
    setLoading(true);
    try {
      await apiFetch("/api/restaurant", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), identityLine: identityLine.trim() || undefined }),
      });
      await refreshMe();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : t("error_network"));
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{t("onboard_create_title")}</Text>
        <Text style={styles.sub}>{t("onboard_create_sub")}</Text>

        <Text style={styles.label}>{t("onboard_create_name_label")}</Text>
        <TextInput
          style={styles.input}
          placeholder={t("onboard_create_name_placeholder")}
          placeholderTextColor={colors.mute}
          value={name}
          onChangeText={setName}
          maxLength={80}
        />

        <Text style={styles.label}>{t("onboard_create_identity_label")}</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder={t("onboard_create_identity_placeholder")}
          placeholderTextColor={colors.mute}
          value={identityLine}
          onChangeText={setIdentityLine}
          multiline
          maxLength={140}
        />

        <View style={styles.actions}>
          <Button
            label={loading ? t("onboard_creating") : t("onboard_btn_create_confirm")}
            disabled={!valid || loading}
            onPress={handleCreate}
          />
          <Button
            label={t("btn_back")}
            variant="ghost"
            onPress={() => router.back()}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  content: {
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xxl,
    gap: spacing.xs,
  },
  title: {
    fontFamily: fonts.serif,
    fontStyle: "italic",
    fontSize: fontSizes.serifLg,
    color: colors.ink,
    marginBottom: spacing.xs,
  },
  sub: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.mute,
    lineHeight: fontSizes.bodySm * 1.5,
    marginBottom: spacing.xl,
  },
  label: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.mute,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: colors.paperSoft,
    borderWidth: 0.5,
    borderColor: colors.edge,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    fontFamily: fonts.sans,
    fontSize: fontSizes.body,
    color: colors.ink,
  },
  textArea: { height: 80, textAlignVertical: "top" },
  actions: { marginTop: spacing.xl, gap: spacing.md },
});
