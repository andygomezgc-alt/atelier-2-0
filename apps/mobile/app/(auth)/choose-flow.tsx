import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useI18n } from "@/src/hooks/useI18n";
import { Button } from "@/src/components/Button";
import { colors, fonts, fontSizes, spacing } from "@/src/theme";

export default function ChooseFlowScreen() {
  const { t } = useI18n();
  const router = useRouter();

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.center}>
        <Text style={styles.mark}>
          <Text style={styles.markGlyph}>A</Text>telier
        </Text>
        <Text style={styles.title}>{t("onboard_welcome")}</Text>
        <Text style={styles.sub}>{t("onboard_choose_sub")}</Text>

        <View style={styles.actions}>
          <Button
            label={t("onboard_btn_create")}
            onPress={() => router.push("/(auth)/create-restaurant")}
          />
          <Button
            label={t("onboard_btn_join")}
            variant="secondary"
            onPress={() => router.push("/(auth)/join-with-code")}
          />
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
  mark: {
    fontFamily: fonts.serif,
    fontStyle: "italic",
    fontSize: fontSizes.serifDisplay + 16,
    color: colors.teal,
    textAlign: "center",
    marginBottom: spacing.xl,
  },
  markGlyph: { color: colors.terracota },
  title: {
    fontFamily: fonts.serif,
    fontStyle: "italic",
    fontSize: fontSizes.serifLg,
    color: colors.ink,
    textAlign: "center",
  },
  sub: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.mute,
    textAlign: "center",
    lineHeight: fontSizes.bodySm * 1.5,
    marginBottom: spacing.xl,
  },
  actions: { gap: spacing.md },
});
