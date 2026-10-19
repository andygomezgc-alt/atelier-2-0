// Brigade starters for an empty chat. Tapping one fills the composer; it never sends.
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useI18n } from "@/src/hooks/useI18n";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";
import { CHAT_STARTER_KEYS, starterDraft } from "../chat-starters";

type Props = {
  onPick: (draft: string) => void;
  disabled: boolean;
};

export function StarterChips({ onPick, disabled }: Props) {
  const { t } = useI18n();
  return (
    <View style={styles.wrap} accessibilityLabel={t("chat_starters_label")}>
      {CHAT_STARTER_KEYS.map((key) => {
        const text = t(key);
        return (
          <Pressable
            key={key}
            onPress={() => {
              if (!disabled) onPick(starterDraft(text));
            }}
            disabled={disabled}
            style={({ pressed }) => [styles.chip, (pressed || disabled) && styles.chipDimmed]}
            accessibilityRole="button"
            accessibilityState={{ disabled }}
          >
            <Text style={styles.chipText}>{text}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.edge,
    backgroundColor: colors.paperSoft,
    borderRadius: radii.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  chipDimmed: { opacity: 0.55 },
  chipText: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.bodySm,
    color: colors.inkSoft,
  },
});
