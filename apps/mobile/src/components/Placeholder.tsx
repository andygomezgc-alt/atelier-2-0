// Reusable empty-screen placeholder used while building Phase 0.
// Each tab renders one of these so we can validate navigation + i18n
// without committing to layouts that 0.8 will rewrite anyway.

import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts, fontSizes, spacing } from "@/src/theme";

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  sub: string;
};

export function Placeholder({ icon, title, sub }: Props) {
  return (
    <View style={styles.root}>
      <Ionicons name={icon} size={36} color={colors.mute} />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.sub}>{sub}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xxl,
    backgroundColor: colors.paper,
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
});
