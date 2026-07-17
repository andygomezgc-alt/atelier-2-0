// Handles the deep link atelier://auth?token=TOKEN&email=EMAIL that
// arrives when the user taps the magic link in their email client.

import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "@/src/hooks/useAuth";
import { verifyMagicLink } from "@/src/api/auth";
import { useI18n } from "@/src/hooks/useI18n";
import { showToast } from "@/src/components/Toast";
import { apiErrorMessage } from "@/src/lib/api-error";
import { colors, fonts, fontSizes, spacing } from "@/src/theme";

export default function VerifyScreen() {
  const { token, email } = useLocalSearchParams<{ token: string; email: string }>();
  const { signInWithToken } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  // Guard against re-running the effect after a successful verify. `t` from
  // useI18n is a fresh function reference on every render, so dropping it (or
  // any other unstable dep) from the array isn't enough — once signInWithToken
  // updates auth state, this screen re-renders before unmounting and a naive
  // effect would call verifyMagicLink a second time with the now-consumed token.
  const inFlight = useRef(false);

  useEffect(() => {
    if (inFlight.current) return;
    if (!token || !email) {
      setError(t("error_invalid_link"));
      return;
    }
    inFlight.current = true;

    // A-11 — usa code para localizar (token_invalid/expired/missing).
    const fail = (err: unknown) => {
      inFlight.current = false;
      const msg = apiErrorMessage(err, t);
      showToast(msg);
      setError(msg);
      setTimeout(() => router.replace("/(auth)/login"), 2000);
    };

    verifyMagicLink(token, email)
      .then(async ({ accessToken, user }) => {
        // P1-9 — antes signInWithToken se llamaba SIN await ni catch: el
        // `.catch()` de la cadena no cubre la promesa porque el callback no la
        // retornaba. Si SecureStore.setItemAsync fallaba (keychain lleno/ocupado
        // en dispositivos reales) el rechazo quedaba huérfano y la pantalla se
        // congelaba en "Verificando…" para siempre. Ahora lo await-eamos y su
        // fallo cae al mismo tratamiento visual (toast + error + redirect).
        try {
          await signInWithToken(accessToken, user);
        } catch (err) {
          fail(err);
        }
      })
      .catch(fail);
  }, [token, email, signInWithToken, router, t]);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.center}>
        <Text style={styles.mark}>
          <Text style={styles.markGlyph}>A</Text>telier
        </Text>
        {error ? (
          <Text style={styles.error}>{error}</Text>
        ) : (
          <Text style={styles.label}>{t("onboard_verifying")}</Text>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl },
  mark: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSizes.serifDisplay + 16,
    color: colors.teal,
    marginBottom: spacing.xl,
  },
  markGlyph: { color: colors.terracota },
  label: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.body,
    color: colors.mute,
    textAlign: "center",
  },
  error: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.danger,
    textAlign: "center",
  },
});
