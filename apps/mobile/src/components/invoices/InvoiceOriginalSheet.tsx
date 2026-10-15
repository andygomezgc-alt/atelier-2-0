// The scanned photo pages, loaded with the session token (the files are private).
import { useEffect, useState } from "react";
import { Image, ScrollView, StyleSheet } from "react-native";
import { invoicePageSource } from "@/src/api/invoices";
import { BottomSheet } from "@/src/components/BottomSheet";
import { colors, radii, spacing } from "@/src/theme";

type Source = { uri: string; headers: Record<string, string> };
type Props = { open: boolean; invoiceId: string; pages: number; onClose: () => void };

export function InvoiceOriginalSheet({ open, invoiceId, pages, onClose }: Props) {
  const [sources, setSources] = useState<Source[]>([]);
  useEffect(() => {
    if (!open) return undefined;
    let live = true;
    Promise.all(Array.from({ length: pages }, (_, position) => invoicePageSource(invoiceId, position)))
      .then((loaded) => { if (live) setSources(loaded); })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [open, invoiceId, pages]);

  return (
    <BottomSheet open={open} onClose={onClose}>
      <ScrollView contentContainerStyle={styles.pages}>
        {sources.map((source) => (
          <Image key={source.uri} source={source} style={styles.page} resizeMode="contain" />
        ))}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  pages: { gap: spacing.md, paddingBottom: spacing.xl },
  page: { width: "100%", aspectRatio: 0.7, borderRadius: radii.sm, backgroundColor: colors.paperWarm },
});
