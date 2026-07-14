import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/hooks/useAuth";
import { useI18n } from "@/src/hooks/useI18n";
import { apiFetch, ApiError } from "@/src/api/client";
import type { JoinRestaurantResponse } from "@atelier/shared";
import { Button } from "@/src/components/Button";
import { showToast } from "@/src/components/Toast";
import { apiErrorMessage } from "@/src/lib/api-error";
import { useKeyboardHeight } from "@/src/lib/keyboard";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

export default function JoinWithCodeScreen() {
  const { refreshMe, patchLocalUser } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const kb = useKeyboardHeight();

  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  const valid = code.trim().length >= 4;

  async function handleJoin() {
    if (!valid || loading) return;
    setLoading(true);
    try {
      // A-10 / Ola 0 0.2: ver create-restaurant.tsx — mismo patrón.
      const res = await apiFetch<JoinRestaurantResponse>("/api/restaurant/join", {
        method: "POST",
        body: JSON.stringify({ code: code.trim().toUpperCase() }),
      });
      patchLocalUser({
        restaurantId: res.restaurantId,
        restaurantName: res.restaurantName,
        role: res.role,
      });
    } catch (err: unknown) {
      // A-11: rate_limited (429), invite_code_invalid (404), already_in_restaurant (409)
      // vienen con code. El helper hace el lookup; en el 409 además refrescamos
      // /me para descubrir el restaurante real (race entre devices).
      if (err instanceof ApiError && err.status === 409) {
        showToast(apiErrorMessage(err, t));
        await refreshMe();
      } else {
        showToast(apiErrorMessage(err, t));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={[styles.center, { paddingBottom: kb }]}>
        <Text style={styles.title}>{t("onboard_join_title")}</Text>
        <Text style={styles.sub}>{t("onboard_join_sub")}</Text>

        <TextInput
          style={styles.input}
          placeholder={t("onboard_join_placeholder")}
          placeholderTextColor={colors.mute}
          value={code}
          onChangeText={(v) => setCode(v.toUpperCase())}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={20}
          onSubmitEditing={handleJoin}
        />

        <View style={styles.actions}>
          <Button
            label={loading ? t("onboard_joining") : t("onboard_btn_join_confirm")}
            disabled={!valid || loading}
            onPress={handleJoin}
          />
          <Button label={t("btn_back")} variant="ghost" onPress={() => router.back()} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  center: {
    flex: 1,
    paddingHorizontal: spacing.xxl,
    justifyContent: "center",
    gap: spacing.sm,
  },
  title: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSizes.serifLg,
    color: colors.ink,
  },
  sub: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.mute,
    lineHeight: fontSizes.bodySm * 1.5,
    marginBottom: spacing.xl,
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
    letterSpacing: 2,
    textAlign: "center",
  },
  actions: { gap: spacing.md, marginTop: spacing.md },
});
