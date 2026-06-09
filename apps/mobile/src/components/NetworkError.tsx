import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useI18n } from "@/src/hooks/useI18n";
import { Button } from "./Button";
import { StatusBadge } from "./StatusBadge";
import { colors, fonts, fontSizes, spacing } from "@/src/theme";

type Props = {
  title?: string;
  sub?: string;
  onRetry?: () => void;
};

export function NetworkError({ title, sub, onRetry }: Props) {
  const { t } = useI18n();
  // Bloque 4 · C-04 — el ícono grande conserva la metáfora universal
  // "sin conexión" (cloud-offline-outline). Debajo, StatusBadge "error"
  // unifica el chip con el vocabulario.
  const resolvedTitle = title ?? t("error_offline_title");
  return (
    <View style={styles.root}>
      <Ionicons name="cloud-offline-outline" size={36} color={colors.mute} />
      <StatusBadge level="error" label={resolvedTitle} />
      <Text style={styles.sub}>{sub ?? t("error_offline_sub")}</Text>
      {onRetry ? (
        <Button label={t("error_retry")} variant="secondary" onPress={onRetry} style={styles.btn} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xxl,
    gap: spacing.sm,
  },
  sub: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.mute,
    textAlign: "center",
    lineHeight: fontSizes.bodySm * 1.5,
    marginTop: spacing.xs,
  },
  btn: { marginTop: spacing.md, alignSelf: "center" },
});
