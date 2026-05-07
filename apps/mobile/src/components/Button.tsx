import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

type Variant = "primary" | "secondary" | "ghost" | "danger";

type Props = {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  disabled?: boolean;
  iconLeft?: keyof typeof Ionicons.glyphMap;
  iconRight?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
};

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled,
  iconLeft,
  iconRight,
  style,
}: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        variantStyles[variant].container,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
      accessibilityRole="button"
    >
      <View style={styles.content}>
        {iconLeft ? (
          <Ionicons name={iconLeft} size={16} color={variantStyles[variant].labelStyle.color as string} />
        ) : null}
        <Text style={[styles.label, variantStyles[variant].labelStyle]}>{label}</Text>
        {iconRight ? (
          <Ionicons name={iconRight} size={16} color={variantStyles[variant].labelStyle.color as string} />
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: 14,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  label: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.body,
    fontWeight: "600",
    letterSpacing: 0.4,
  },
  disabled: { opacity: 0.4 },
  pressed: { transform: [{ scale: 0.98 }] },
});

const variantStyles = {
  primary: {
    container: { backgroundColor: colors.terracota },
    labelStyle: { color: colors.paper },
  },
  secondary: {
    container: {
      backgroundColor: colors.paperSoft,
      borderWidth: 0.5,
      borderColor: colors.edge,
    },
    labelStyle: { color: colors.ink },
  },
  ghost: {
    container: {
      backgroundColor: "transparent",
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: colors.terracota,
    },
    labelStyle: { color: colors.terracota },
  },
  danger: {
    container: { backgroundColor: colors.danger },
    labelStyle: { color: colors.paper },
  },
} as const;
