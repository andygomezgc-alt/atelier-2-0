// Search the bank and pick the product an invoice line goes to.
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput } from "react-native";
import { listProducts, type Product } from "@/src/api/products";
import { BottomSheet } from "@/src/components/BottomSheet";
import { useI18n } from "@/src/hooks/useI18n";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

type Props = { open: boolean; onPick: (productId: string) => void; onClose: () => void };

export function ProductPickerSheet({ open, onPick, onClose }: Props) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Product[] | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 2) {
      setResults(null);
      return undefined;
    }
    let live = true;
    const timer = setTimeout(() => {
      listProducts({ q })
        .then((items) => { if (live) setResults(items.slice(0, 20)); })
        .catch(() => { if (live) setResults([]); });
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [open, query]);

  return (
    <BottomSheet open={open} onClose={onClose}>
      <Text style={styles.title}>{t("invoice_line_choose")}</Text>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={t("invoice_picker_search")}
        placeholderTextColor={colors.mute}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
      />
      {results && results.length === 0 ? <Text style={styles.empty}>{t("invoice_picker_empty")}</Text> : null}
      {results?.map((product) => (
        <Pressable key={product.id} accessibilityRole="button" accessibilityLabel={product.name} style={styles.row} onPress={() => onPick(product.id)}>
          <Text style={styles.name}>{product.name}</Text>
        </Pressable>
      ))}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.serifMedium, fontSize: fontSizes.serifMd, color: colors.ink, marginBottom: spacing.md },
  input: {
    fontFamily: fonts.sans, fontSize: fontSizes.bodyLg, color: colors.ink, borderWidth: 1, borderColor: colors.edge,
    borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginBottom: spacing.sm,
  },
  empty: { fontFamily: fonts.sans, fontSize: fontSizes.body, color: colors.mute, paddingVertical: spacing.md },
  row: { paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.edgeSoft },
  name: { fontFamily: fonts.sans, fontSize: fontSizes.bodyLg, color: colors.ink },
});
