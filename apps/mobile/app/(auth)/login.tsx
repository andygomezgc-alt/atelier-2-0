import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/src/hooks/useAuth";
import { useI18n } from "@/src/hooks/useI18n";
import { showToast } from "@/src/components/Toast";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

export default function LoginScreen() {
  const { sendMagicLink } = useAuth();
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const valid = email.includes("@") && email.includes(".");

  async function handleSend() {
    if (!valid || loading) return;
    setLoading(true);
    try {
      await sendMagicLink(email.toLowerCase().trim());
      setSent(true);
    } catch {
      showToast(t("error_network"));
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

        {sent ? (
          <View style={styles.sentBox}>
            <Text style={styles.sentTitle}>{t("onboard_check_email")}</Text>
            <Text style={styles.sentSub}>{t("onboard_magic_sent")}</Text>
            <Pressable onPress={() => setSent(false)}>
              <Text style={styles.retry}>{t("onboard_retry")}</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <TextInput
              style={styles.input}
              placeholder={t("onboard_email_placeholder")}
              placeholderTextColor={colors.mute}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={handleSend}
            />
            <Pressable
              style={[styles.button, (!valid || loading) && styles.buttonDisabled]}
              disabled={!valid || loading}
              onPress={handleSend}
            >
              <Text style={styles.buttonLabel}>
                {loading ? t("onboard_sending") : t("onboard_btn_magic_link")}
              </Text>
            </Pressable>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, paddingHorizontal: spacing.xxl, justifyContent: "center" },
  mark: {
    fontFamily: fonts.serif,
    fontStyle: "italic",
    fontSize: fontSizes.serifDisplay + 16,
    color: colors.teal,
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  markGlyph: { color: colors.terracota },
  tag: {
    fontFamily: fonts.serif,
    fontStyle: "italic",
    fontSize: fontSizes.body,
    color: colors.mute,
    textAlign: "center",
    marginBottom: spacing.xxl,
  },
  input: {
    backgroundColor: colors.paperSoft,
    borderWidth: 0.5,
    borderColor: colors.edge,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodyLg,
    color: colors.ink,
    marginBottom: spacing.lg,
  },
  button: {
    backgroundColor: colors.terracota,
    borderRadius: radii.lg,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.4 },
  buttonLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.body,
    color: colors.paper,
    fontWeight: "600",
    letterSpacing: 0.4,
  },
  sentBox: { alignItems: "center", gap: spacing.md },
  sentTitle: {
    fontFamily: fonts.serif,
    fontStyle: "italic",
    fontSize: fontSizes.serifLg,
    color: colors.ink,
    textAlign: "center",
  },
  sentSub: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.mute,
    textAlign: "center",
    lineHeight: fontSizes.bodySm * 1.5,
  },
  retry: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.terracota,
    marginTop: spacing.sm,
  },
});
