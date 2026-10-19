// Supplier invoices, newest first, grouped by supplier. A band counts the ones waiting for
// review; the list refreshes by itself while any invoice is being read.
import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import type { InvoiceListResponse } from "@atelier/shared";
import { listInvoices } from "@/src/api/invoices";
import { Button } from "@/src/components/Button";
import { Empty } from "@/src/components/Empty";
import { NetworkError } from "@/src/components/NetworkError";
import { Screen } from "@/src/components/Screen";
import { SkeletonList } from "@/src/components/SkeletonList";
import { StatusBadge } from "@/src/components/StatusBadge";
import { usePolling } from "@/src/hooks/usePolling";
import { useRefresh } from "@/src/hooks/useRefresh";
import { dateLocale, useI18n } from "@/src/hooks/useI18n";
import { formatDay, invoiceDay, STATUS_BADGE } from "@/src/lib/invoice-view";
import { formatEuros } from "@/src/lib/money";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

// The invoice list has no client cache to invalidate before a pull-to-refresh.
const NO_CACHE_PREFIXES: readonly string[] = [];

export default function InvoicesScreen() {
  const router = useRouter();
  const { t, lang } = useI18n();
  const [data, setData] = useState<InvoiceListResponse | null>(null);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    try {
      setData(await listInvoices());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));
  const reading = data?.suppliers.some((g) => g.invoices.some((i) => i.status === "reading" || i.status === "uploading")) ?? false;
  usePolling(reading, () => { void reload(); });
  const { refreshing, onRefresh } = useRefresh(NO_CACHE_PREFIXES, reload);

  const scan = () => router.push("/facturas/escanear" as never);

  let body: React.ReactNode;
  if (!data) {
    body = failed ? <NetworkError onRetry={() => void reload()} /> : <View style={styles.loading}><SkeletonList rows={4} /></View>;
  } else if (data.suppliers.length === 0) {
    body = <Empty icon="receipt-outline" title={t("invoices_empty_title")} sub={t("invoices_empty_sub")} actionLabel={t("invoices_scan")} onAction={scan} />;
  } else {
    body = (
      <>
        <Button label={t("invoices_scan")} iconLeft="camera-outline" onPress={scan} />
        {data.toReview > 0 ? (
          <View style={styles.band}>
            <Text style={styles.bandText}>{t("invoices_to_review", { count: data.toReview })}</Text>
          </View>
        ) : null}
        {data.suppliers.map((group) => (
          <View key={group.supplier?.id ?? "none"} style={styles.group}>
            <Text style={styles.supplier}>{group.supplier?.name ?? t("invoices_no_supplier")}</Text>
            {group.invoices.map((invoice) => {
              const badge = STATUS_BADGE[invoice.status];
              const total = invoice.grossTotalCents ?? invoice.netTotalCents;
              return (
                <Pressable
                  key={invoice.id}
                  style={styles.row}
                  accessibilityRole="button"
                  accessibilityLabel={`${group.supplier?.name ?? t("invoices_no_supplier")} ${invoice.number ?? t("invoices_no_number")}`}
                  onPress={() => router.push(`/facturas/${invoice.id}` as never)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.number}>{invoice.number ?? t("invoices_no_number")}</Text>
                    <Text style={styles.day}>{formatDay(invoiceDay(invoice), dateLocale(lang))}</Text>
                  </View>
                  {total !== null ? <Text style={styles.total}>{formatEuros(total)}</Text> : null}
                  <StatusBadge level={badge.level} label={t(badge.key)} />
                  <Ionicons name="chevron-forward" size={16} color={colors.mute} />
                </Pressable>
              );
            })}
          </View>
        ))}
      </>
    );
  }

  // The empty and offline states pull down to reload too, not only a filled list.
  const filled = !!data && data.suppliers.length > 0;
  return (
    <Screen title={t("invoices_title")} back onBack={() => router.back()}>
      <ScrollView
        contentContainerStyle={filled ? styles.content : styles.state}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={colors.terracota}
            colors={[colors.terracota]}
            progressBackgroundColor={colors.paper}
          />
        }
      >
        {body}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { paddingHorizontal: spacing.lg },
  state: { flexGrow: 1 },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  band: { backgroundColor: colors.terracotaSoft, borderRadius: radii.md, padding: spacing.md },
  bandText: { fontFamily: fonts.sans, fontSize: fontSizes.body, color: colors.ink },
  group: { gap: spacing.xs },
  supplier: { fontFamily: fonts.serifMedium, fontSize: fontSizes.serifBody, color: colors.ink, marginTop: spacing.sm },
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.paperSoft,
    borderRadius: radii.md, borderWidth: 1, borderColor: colors.edgeSoft, padding: spacing.md,
  },
  number: { fontFamily: fonts.sans, fontSize: fontSizes.body, color: colors.ink },
  day: { fontFamily: fonts.sans, fontSize: fontSizes.caption, color: colors.mute },
  total: { fontFamily: fonts.mono, fontSize: fontSizes.bodySm, color: colors.inkSoft },
});
