// Handles the deep link atelier://auth?token=TOKEN&email=EMAIL that
// arrives when the user taps the magic link in their email client.

import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "@/src/hooks/useAuth";
import { verifyMagicLink } from "@/src/api/auth";
import { useI18n } from "@/src/hooks/useI18n";
import { showToast } from "@/src/components/Toast";
import { colors, fonts, fontSizes, spacing } from "@/src/theme";

export default function VerifyScreen() {
  const { token, email } = useLocalSearchParams<{ token: string; email: string }>();
  const { signInWithToken } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !email) {
      setError(t("error_invalid_link"));
      return;
    }

    verifyMagicLink(token, email)
      .then(({ accessToken, user }) => {
        signInWithToken(accessToken, user);
      })
      .catch((err: Error) => {
        showToast(err.message ?? t("error_network"));
        setError(err.message);
        setTimeout(() => router.replace("/(auth)/login"), 2000);
      });
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
    fontFamily: fonts.serif,
    fontStyle: "italic",
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
