import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FontAwesome } from "@expo/vector-icons";
import { useAuth } from "@/src/hooks/useAuth";
import { useI18n } from "@/src/hooks/useI18n";
import { showToast } from "@/src/components/Toast";
import { ApiError, NetworkError } from "@/src/api/client";
import { apiErrorMessage } from "@/src/lib/api-error";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

// Login solo-Google (Andy 2026-07-20): un toque, sin correos ni códigos. El
// flujo de email/magic link se retiró del cliente; el backend lo conserva por
// si vuelve. verify.tsx (deep link atelier://auth) queda inerte pero inofensivo.
export default function LoginScreen() {
  const { signInWithGoogle } = useAuth();
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);

  async function handleGoogle() {
    if (loading) return;
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      // Errores del server llegan tipados (google_signin_failed) o de red; el
      // resto (sin idToken, Play Services) cae al mensaje genérico de Google.
      const msg =
        err instanceof ApiError || err instanceof NetworkError
          ? apiErrorMessage(err, t)
          : t("error_google_signin");
      showToast(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.center}>
        <Text style={styles.mark}>
          <Text style={styles.markGlyph}>A</Text>telier
        </Text>
        <Text style={styles.tag}>{t("onboard_tag")}</Text>

        <Pressable
          style={[styles.googleButton, loading && styles.buttonDisabled]}
          disabled={loading}
          onPress={handleGoogle}
        >
          <FontAwesome name="google" size={18} color={colors.ink} />
          <Text style={styles.googleLabel}>{t("onboard_btn_google")}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, paddingHorizontal: spacing.xxl, justifyContent: "center" },
  mark: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSizes.serifDisplay + 16,
    color: colors.teal,
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  markGlyph: { color: colors.terracota },
  tag: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSizes.serifBody,
    color: colors.mute,
    textAlign: "center",
    marginBottom: spacing.xxl,
  },
  buttonDisabled: { opacity: 0.4 },
  googleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.paperSoft,
    borderWidth: 0.5,
    borderColor: colors.edge,
    borderRadius: radii.lg,
    paddingVertical: 14,
  },
  googleLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.body,
    color: colors.ink,
    fontWeight: "600",
    letterSpacing: 0.4,
  },
});
