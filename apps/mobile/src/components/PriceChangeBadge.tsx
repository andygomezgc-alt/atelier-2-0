// How much a product's last price moved, on its row in the product list (proposal 4).
// A rise is a cost going up, so it takes the danger colour; a drop takes green.
import { StyleSheet, Text } from "react-native";
import { useI18n } from "@/src/hooks/useI18n";
import { colors, fonts, fontSizes, spacing } from "@/src/theme";

export function PriceChangeBadge({ pct }: { pct: number | null | undefined }) {
  const { t } = useI18n();
  if (!pct) return null;
  const up = pct > 0;
  const n = Math.abs(pct);
  return (
    <Text
      style={[styles.text, { color: up ? colors.danger : colors.green }]}
      accessibilityLabel={t(up ? "product_price_up_a11y" : "product_price_down_a11y", { n })}
      numberOfLines={1}
    >
      {t(up ? "product_price_up" : "product_price_down", { n })}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: { fontFamily: fonts.sans, fontSize: fontSizes.caption, fontWeight: "600", marginTop: 2, marginLeft: spacing.xs },
});
