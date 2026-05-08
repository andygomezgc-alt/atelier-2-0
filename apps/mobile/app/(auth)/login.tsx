import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/src/hooks/useAuth";
import { useI18n } from "@/src/hooks/useI18n";
import { showToast } from "@/src/components/Toast";
import { verifyMagicLink } from "@/src/api/auth";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

type Mode = "email" | "sent" | "paste";

export default function LoginScreen() {
  const { sendMagicLink, signInWithToken } = useAuth();
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [mode, setMode] = useState<Mode>("email");
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState("");

  const valid = email.includes("@") && email.includes(".");

  async function handleSend() {
    if (!valid || loading) return;
    setLoading(true);
    try {
      await sendMagicLink(email.toLowerCase().trim());
      setMode("sent");
    } catch {
      showToast(t("error_network"));
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify() {
    const token = code.trim();
    if (!token || !valid || loading) {
      showToast(t("onboard_paste_invalid"));
      return;
    }
    setLoading(true);
    try {
      const { accessToken, user } = await verifyMagicLink(token, email.toLowerCase().trim());
      await signInWithToken(accessToken, user);
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("error_network"));
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

        {mode === "sent" ? (
          <View style={styles.sentBox}>
            <Text style={styles.sentTitle}>{t("onboard_check_email")}</Text>
            <Text style={styles.sentSub}>{t("onboard_magic_sent")}</Text>
            <Pressable onPress={() => setMode("email")}>
              <Text style={styles.retry}>{t("onboard_retry")}</Text>
            </Pressable>
            <Pressable onPress={() => setMode("paste")}>
              <Text style={styles.pasteLink}>{t("onboard_paste_link")}</Text>
            </Pressable>
          </View>
        ) : mode === "paste" ? (
          <View style={styles.sentBox}>
            <Text style={styles.sentTitle}>{t("onboard_paste_title")}</Text>
            <Text style={styles.sentSub}>{t("onboard_paste_sub")}</Text>
            <TextInput
              style={styles.codeInput}
              placeholder={t("onboard_paste_placeholder")}
              placeholderTextColor={colors.mute}
              value={code}
              onChangeText={setCode}
              autoCapitalize="none"
              autoCorrect={false}
              multiline
            />
            <Pressable
              style={[styles.button, (!code.trim() || loading) && styles.buttonDisabled]}
              disabled={!code.trim() || loading}
              onPress={handleVerify}
            >
              <Text style={styles.buttonLabel}>
                {loading ? t("onboard_verifying") : t("onboard_paste_btn")}
              </Text>
            </Pressable>
            <Pressable onPress={() => setMode("sent")}>
              <Text style={styles.retry}>{t("onboard_paste_back")}</Text>
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
  pasteLink: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.mute,
    marginTop: spacing.xs,
    textDecorationLine: "underline",
  },
  codeInput: {
    backgroundColor: colors.paperSoft,
    borderWidth: 0.5,
    borderColor: colors.edge,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontFamily: fonts.mono,
    fontSize: fontSizes.bodySm,
    color: colors.ink,
    width: "100%",
    minHeight: 80,
    textAlignVertical: "top",
    marginVertical: spacing.md,
  },
});
