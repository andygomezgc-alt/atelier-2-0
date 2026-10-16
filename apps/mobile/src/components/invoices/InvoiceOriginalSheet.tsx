// The scanned photo pages, loaded with the session token (the files are private).
import { useEffect, useState } from "react";
import { Image, ScrollView, StyleSheet, Text } from "react-native";
import { invoicePageSource } from "@/src/api/invoices";
import { BottomSheet } from "@/src/components/BottomSheet";
import { useI18n } from "@/src/hooks/useI18n";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

type Source = { uri: string; headers: Record<string, string> };
type Props = { open: boolean; invoiceId: string; pages: number; onClose: () => void };

export function InvoiceOriginalSheet({ open, invoiceId, pages, onClose }: Props) {
  const { t } = useI18n();
  const [sources, setSources] = useState<Source[]>([]);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setSources([]);
    setFailed(false);
    if (!open) return undefined;
    let live = true;
    Promise.all(Array.from({ length: pages }, (_, position) => invoicePageSource(invoiceId, position)))
      .then((loaded) => { if (live) setSources(loaded); })
      .catch(() => { if (live) setFailed(true); });
    return () => {
      live = false;
    };
  }, [open, invoiceId, pages]);

  return (
    <BottomSheet open={open} onClose={onClose}>
      <ScrollView contentContainerStyle={styles.pages}>
        {failed ? <Text style={styles.error}>{t("invoice_original_failed")}</Text> : null}
        {sources.map((source) => (
          <Image key={source.uri} source={source} style={styles.page} resizeMode="contain" />
        ))}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  pages: { gap: spacing.md, paddingBottom: spacing.xl },
  error: { fontFamily: fonts.sans, fontSize: fontSizes.bodySm, color: colors.danger },
  page: { width: "100%", aspectRatio: 0.7, borderRadius: radii.sm, backgroundColor: colors.paperWarm },
});
