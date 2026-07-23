import { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FontAwesome } from "@expo/vector-icons";
import * as AppleAuthentication from "expo-apple-authentication";
import { useAuth } from "@/src/hooks/useAuth";
import { useI18n } from "@/src/hooks/useI18n";
import { showToast } from "@/src/components/Toast";
import { ApiError, NetworkError } from "@/src/api/client";
import { apiErrorMessage } from "@/src/lib/api-error";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

// Login nativo con Apple en iPhone y Google en las plataformas compatibles.
// El flujo de email/magic link se retiró del cliente; el backend lo conserva
// por si vuelve. verify.tsx (deep link atelier://auth) queda inerte.
export default function LoginScreen() {
  const { signInWithApple, signInWithGoogle } = useAuth();
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "ios") return;

    let mounted = true;
    AppleAuthentication.isAvailableAsync()
      .then((available) => {
        if (mounted) setAppleAvailable(available);
      })
      .catch(() => {
        if (mounted) setAppleAvailable(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  async function handleApple() {
    if (loading) return;
    setLoading(true);
    try {
      await signInWithApple();
    } catch (err) {
      const msg =
        err instanceof ApiError || err instanceof NetworkError
          ? apiErrorMessage(err, t)
          : t("error_apple_signin");
      showToast(msg);
    } finally {
      setLoading(false);
    }
  }

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

        <View style={styles.authButtons}>
          {appleAvailable ? (
            <View
              pointerEvents={loading ? "none" : "auto"}
              style={loading && styles.buttonDisabled}
            >
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={radii.lg}
                style={styles.appleButton}
                onPress={handleApple}
              />
            </View>
          ) : null}

          <Pressable
            style={[styles.googleButton, loading && styles.buttonDisabled]}
            disabled={loading}
            onPress={handleGoogle}
          >
            <FontAwesome name="google" size={18} color={colors.ink} />
            <Text style={styles.googleLabel}>{t("onboard_btn_google")}</Text>
          </Pressable>
        </View>
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
  authButtons: { gap: spacing.md },
  // Apple exige su botón oficial. Solo definimos dimensiones; el color y el
  // radio se configuran con las props públicas del componente nativo.
  appleButton: { width: "100%", height: 50 },
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
