// One supplier invoice: reading (refreshes by itself), failed (a plain reason, retry or delete),
// review (decide every line, then apply) or applied (read-only, what was done per line).
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import type { InvoiceDetail, InvoiceHeaderPatch, InvoiceLinePatch } from "@atelier/shared";
import { invalidate } from "@/src/api/cache";
import {
  applyInvoice, chooseProduct, deleteInvoice, getInvoice, listInvoices, patchInvoiceHeader, patchInvoiceLine, retryInvoice,
  type InvoiceApplyResult,
} from "@/src/api/invoices";
import { Button } from "@/src/components/Button";
import { ConfirmSheet } from "@/src/components/ConfirmSheet";
import { NetworkError } from "@/src/components/NetworkError";
import { Screen } from "@/src/components/Screen";
import { StatusBadge } from "@/src/components/StatusBadge";
import { showToast } from "@/src/components/Toast";
import { InvoiceHeaderSheet } from "@/src/components/invoices/InvoiceHeaderSheet";
import { InvoiceLineCard } from "@/src/components/invoices/InvoiceLineCard";
import { InvoiceOriginalSheet } from "@/src/components/invoices/InvoiceOriginalSheet";
import { usePolling } from "@/src/hooks/usePolling";
import { dateLocale, useI18n } from "@/src/hooks/useI18n";
import { apiErrorMessage } from "@/src/lib/api-error";
import { openInvoicePdf } from "@/src/lib/invoice-original";
import { failureKey, formatDay, invoiceDay, STATUS_BADGE, undecidedPositions } from "@/src/lib/invoice-view";
import { formatEuros } from "@/src/lib/money";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

type Sheet = "none" | "delete" | "header" | "original";

export default function InvoiceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t, lang } = useI18n();
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<Sheet>("none");
  const [summary, setSummary] = useState<InvoiceApplyResult | null>(null);
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>([]);
  const applying = useRef(false);

  const reload = useCallback(async () => {
    try {
      setInvoice(await getInvoice(id));
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, [id]);
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));
  usePolling(invoice?.status === "reading" || invoice?.status === "uploading", () => { void reload(); });

  const explain = (error: unknown) => showToast(apiErrorMessage(error, t), "error");
  const decide = async (run: () => Promise<unknown>) => {
    try {
      await run();
    } catch (error) {
      explain(error);
    }
    await reload();
  };

  const remove = async () => {
    setBusy(true);
    try {
      await deleteInvoice(id);
      setSheet("none");
      router.back();
    } catch (error) {
      explain(error);
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (applying.current) return;
    applying.current = true;
    setBusy(true);
    try {
      const result = await applyInvoice(id);
      invalidate("products:");
      invalidate("recipes:");
      setSummary(result);
    } catch (error) {
      explain(error);
    } finally {
      applying.current = false;
      setBusy(false);
    }
    await reload();
  };

  const openHeader = async () => {
    setSheet("header");
    try {
      const list = await listInvoices();
      setSuppliers(list.suppliers.flatMap((group) => (group.supplier ? [group.supplier] : [])));
    } catch {
      setSuppliers([]);
    }
  };
  const saveHeader = async (patch: InvoiceHeaderPatch) => {
    try {
      await patchInvoiceHeader(id, patch);
    } catch (error) {
      explain(error);
      throw error;
    }
    await reload();
  };

  const openOriginal = async () => {
    if (invoice?.pages[0]?.mimeType !== "application/pdf") {
      setSheet("original");
      return;
    }
    try {
      await openInvoicePdf(id);
    } catch {
      showToast(t("invoice_original_failed"), "error");
    }
  };

  const shell = (children: React.ReactNode) => (
    <Screen title={t("invoice_title")} back onBack={() => router.back()}>
      {children}
    </Screen>
  );

  if (!invoice) {
    return shell(loadFailed ? <NetworkError onRetry={() => void reload()} /> : <ActivityIndicator color={colors.teal} style={styles.loading} />);
  }

  if (invoice.status === "reading" || invoice.status === "uploading") {
    return shell(
      <View style={styles.centered}>
        <ActivityIndicator color={colors.teal} />
        <Text style={styles.stateTitle}>{t("invoice_reading_title")}</Text>
        <Text style={styles.stateSub}>{t("invoice_reading_sub")}</Text>
      </View>,
    );
  }

  const deleteSheet = (
    <ConfirmSheet
      open={sheet === "delete"}
      title={t("invoice_delete_confirm_title")}
      body={t("invoice_delete_confirm_body")}
      confirmLabel={t("invoice_delete")}
      cancelLabel={t("confirm_cancel")}
      destructive
      busy={busy}
      onConfirm={remove}
      onCancel={() => setSheet("none")}
    />
  );

  if (invoice.status === "failed") {
    return shell(
      <View style={styles.centered}>
        <Text style={styles.stateTitle}>{t("invoice_failed_title")}</Text>
        <Text style={styles.stateSub}>{t(failureKey(invoice.failureReason))}</Text>
        <Button label={t("invoice_retry")} onPress={() => decide(() => retryInvoice(id))} />
        <Button label={t("invoice_delete")} variant="danger" onPress={() => setSheet("delete")} />
        {deleteSheet}
      </View>,
    );
  }

  const inReview = invoice.status === "review";
  const undecided = undecidedPositions(invoice.lines).length;
  const total = invoice.grossTotalCents ?? invoice.netTotalCents;
  const badge = STATUS_BADGE[invoice.status];
  const describeLine = (position: number) => invoice.lines.find((l) => l.position === position)?.description ?? `#${position + 1}`;

  return shell(
    <>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <Text style={styles.supplier}>{invoice.supplier?.name ?? t("invoices_no_supplier")}</Text>
            <StatusBadge level={badge.level} label={t(badge.key)} />
          </View>
          <Text style={styles.headerLine}>{`${t("invoice_number_label")}: ${invoice.number ?? t("invoices_no_number")}`}</Text>
          <Text style={styles.headerLine}>{`${t("invoice_date_label")}: ${formatDay(invoiceDay(invoice), dateLocale(lang))}`}</Text>
          {total !== null ? <Text style={styles.headerLine}>{`${t("invoice_total_label")}: ${formatEuros(total)}`}</Text> : null}
          <View style={styles.headerActions}>
            {inReview ? <Button label={t("invoice_edit_header")} variant="ghost" onPress={openHeader} /> : null}
            <Button label={t("invoice_view_original")} variant="ghost" onPress={openOriginal} />
            {inReview ? <Button label={t("invoice_delete")} variant="ghost" onPress={() => setSheet("delete")} /> : null}
          </View>
        </View>

        {invoice.checks.totals.status === "mismatch" && invoice.checks.totals.sumCents !== null ? (
          <View style={styles.warning}>
            <Text style={styles.warningText}>{t("invoice_warning_totals", { sum: formatEuros(invoice.checks.totals.sumCents) })}</Text>
          </View>
        ) : null}
        {invoice.checks.duplicateOf ? (
          <View style={styles.warning}>
            <Text style={styles.warningText}>{t("invoice_warning_duplicate")}</Text>
            <Button
              label={t("invoice_warning_duplicate_open")}
              variant="ghost"
              onPress={() => router.push(`/facturas/${invoice.checks.duplicateOf}` as never)}
            />
          </View>
        ) : null}

        {summary ? (
          <View style={styles.summary}>
            {"updated" in summary ? (
              <>
                <Text style={styles.summaryText}>{t("invoice_apply_done", { updated: summary.updated, drafts: summary.drafts })}</Text>
                {summary.skipped.map((s) => (
                  <Text key={s.position} style={styles.summarySkipped}>
                    {t(s.reason === "product_deleted" ? "invoice_skipped_product_deleted" : "invoice_skipped_newer_price", { line: describeLine(s.position) })}
                  </Text>
                ))}
              </>
            ) : (
              <Text style={styles.summaryText}>{t("invoice_apply_already")}</Text>
            )}
          </View>
        ) : null}

        {invoice.lines.map((line) => (
          <InvoiceLineCard
            key={line.position}
            line={line}
            readOnly={!inReview}
            onPatch={(body: InvoiceLinePatch) => decide(() => patchInvoiceLine(id, line.position, body))}
            onChooseProduct={(productId: string) => decide(() => chooseProduct(id, line.position, productId))}
          />
        ))}
      </ScrollView>

      {inReview ? (
        <View style={styles.footer}>
          <Button
            label={undecided > 0 ? t("invoice_apply_undecided", { count: undecided }) : t("invoice_apply")}
            disabled={undecided > 0 || busy}
            onPress={apply}
          />
        </View>
      ) : null}

      {deleteSheet}
      <InvoiceHeaderSheet open={sheet === "header"} invoice={invoice} suppliers={suppliers} onSave={saveHeader} onClose={() => setSheet("none")} />
      <InvoiceOriginalSheet open={sheet === "original"} invoiceId={id} pages={invoice.pages.length} onClose={() => setSheet("none")} />
    </>,
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: spacing.xxl },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.xxl },
  stateTitle: { fontFamily: fonts.serifMedium, fontSize: fontSizes.serifMd, color: colors.ink, textAlign: "center" },
  stateSub: { fontFamily: fonts.sans, fontSize: fontSizes.body, color: colors.inkSoft, textAlign: "center" },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl * 3 },
  header: { gap: spacing.xs, padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.paperWarm },
  headerTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  supplier: { flex: 1, fontFamily: fonts.serifMedium, fontSize: fontSizes.serifLg, color: colors.ink },
  headerLine: { fontFamily: fonts.sans, fontSize: fontSizes.body, color: colors.inkSoft },
  headerActions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.xs },
  warning: { gap: spacing.xs, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.terracotaSoft },
  warningText: { fontFamily: fonts.sans, fontSize: fontSizes.body, color: colors.ink },
  summary: { gap: spacing.xs, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.tealSoft },
  summaryText: { fontFamily: fonts.sans, fontSize: fontSizes.body, color: colors.ink },
  summarySkipped: { fontFamily: fonts.sans, fontSize: fontSizes.bodySm, color: colors.inkSoft },
  footer: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.edgeSoft, backgroundColor: colors.paper },
});
