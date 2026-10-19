// Ghost cards shown while a list loads, shaped like the list's cards (title,
// meta and price lines). They pulse gently unless the system reduces motion.
import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { useI18n } from "@/src/hooks/useI18n";
import { useReduceMotion } from "@/src/hooks/useReduceMotion";
import { colors, radii, spacing } from "@/src/theme";

type Props = {
  rows?: number;
  // A tall block first, for screens that open with a hero (La Casa).
  hero?: boolean;
};

export function SkeletonList({ rows = 4, hero = false }: Props) {
  const { t } = useI18n();
  const reduceMotion = useReduceMotion();
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduceMotion !== false) {
      opacity.setValue(1);
      return;
    }
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.45, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [reduceMotion, opacity]);

  return (
    <Animated.View
      style={[styles.wrap, { opacity }]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t("skeleton_loading")}
      accessibilityState={{ busy: true }}
    >
      {hero ? <View testID="skeleton-hero" style={styles.hero} /> : null}
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} testID="skeleton-card" style={styles.card}>
          <View style={[styles.line, styles.lineTitle]} />
          <View style={[styles.line, styles.lineMeta]} />
          <View style={[styles.line, styles.linePrice]} />
        </View>
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm, paddingTop: spacing.sm },
  hero: { height: 160, borderRadius: radii.lg, backgroundColor: colors.edgeSoft },
  card: {
    backgroundColor: colors.paperSoft,
    borderRadius: radii.md,
    borderWidth: 0.5,
    borderColor: colors.edge,
    padding: spacing.md,
    gap: spacing.sm,
  },
  line: { height: 10, borderRadius: radii.sm, backgroundColor: colors.edgeSoft },
  lineTitle: { width: "62%", height: 14 },
  lineMeta: { width: "38%" },
  linePrice: { width: "48%" },
});
