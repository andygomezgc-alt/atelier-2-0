import { StyleSheet, View, type ViewProps } from "react-native";
import { colors, radii, spacing } from "@/src/theme";

export function Card({ style, ...rest }: ViewProps) {
  return <View {...rest} style={[styles.base, style]} />;
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.paperSoft,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 0.5,
    borderColor: colors.edge,
  },
});
