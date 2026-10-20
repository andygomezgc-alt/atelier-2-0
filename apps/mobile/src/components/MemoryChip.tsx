import { Pressable, StyleSheet, Text, View } from "react-native";
import { useI18n } from "@/src/hooks/useI18n";
import { colors, fonts, fontSizes, radii } from "@/src/theme";

type Props = { enabled: boolean; onPress: () => void };

// Chat action pill showing whether the culinary memory is on; opens "Nuestra cocina".
export function MemoryChip({ enabled, onPress }: Props) {
  const { t } = useI18n();
  const label = t(enabled ? "chat_memory" : "chat_memory_off");
  const tint = enabled ? colors.green : colors.mute;
  return (
    <Pressable
      style={({ pressed }) => [styles.pill, { borderColor: enabled ? colors.green : colors.edge }, pressed && styles.pressed]}
      onPress={onPress}
      hitSlop={7}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={t("chat_memory_hint")}
    >
      <View style={[styles.dot, { backgroundColor: tint }]} />
      <Text style={[styles.label, { color: tint }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 0.5,
    borderRadius: radii.pill,
    minHeight: 34,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pressed: { opacity: 0.5 },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  label: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSizes.body,
  },
});
