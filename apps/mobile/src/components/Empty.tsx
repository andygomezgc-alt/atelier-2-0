import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts, fontSizes, spacing } from "@/src/theme";
import { Button } from "./Button";

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  sub?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function Empty({ icon, title, sub, actionLabel, onAction }: Props) {
  return (
    <View style={styles.root}>
      <Ionicons name={icon} size={36} color={colors.mute} />
      <Text style={styles.title}>{title}</Text>
      {sub ? <Text style={styles.sub}>{sub}</Text> : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} variant="secondary" onPress={onAction} style={styles.action} />
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
  title: {
    fontFamily: fonts.serif,
    fontStyle: "italic",
    fontSize: fontSizes.serifLg,
    color: colors.ink,
    textAlign: "center",
    marginTop: spacing.md,
  },
  sub: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.mute,
    textAlign: "center",
    lineHeight: fontSizes.bodySm * 1.5,
  },
  action: { marginTop: spacing.md, alignSelf: "center" },
});
