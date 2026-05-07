import { StyleSheet, Text, type TextProps } from "react-native";
import { colors, fonts, fontSizes } from "@/src/theme";

type Variant = "default" | "terracota";

type Props = TextProps & { variant?: Variant };

export function Eyebrow({ variant = "default", style, ...rest }: Props) {
  return <Text {...rest} style={[styles.base, variant === "terracota" && styles.terracota, style]} />;
}

const styles = StyleSheet.create({
  base: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.eyebrow,
    color: colors.mute,
    textTransform: "uppercase",
    letterSpacing: 1.4,
    fontWeight: "500",
  },
  terracota: { color: colors.terracota },
});
