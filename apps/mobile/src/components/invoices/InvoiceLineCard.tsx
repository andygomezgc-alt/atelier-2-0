// One line of a supplier invoice: what the paper says, the product it goes to, the price
// before → after, and the chef's decision. A change of 20 % or more waits for a tick.
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { InvoiceLineAction, InvoiceLinePatch, InvoiceLineView } from "@atelier/shared";
import { Button } from "@/src/components/Button";
import { ChoiceSheet } from "@/src/components/ChoiceSheet";
import { ConfirmMatchSheet } from "@/src/components/ConfirmMatchSheet";
import { EditableCell } from "@/src/components/EditableCell";
import { PickVariantSheet } from "@/src/components/PickVariantSheet";
import { StatusBadge } from "@/src/components/StatusBadge";
import { ProductPickerSheet } from "@/src/components/invoices/ProductPickerSheet";
import { useI18n } from "@/src/hooks/useI18n";
import { ACTION_KEY, DONE_KEY, lineState, priceChange } from "@/src/lib/invoice-view";
import { formatEuros, parseEurosToCents } from "@/src/lib/money";
import { colors, fonts, fontSizes, radii, spacing } from "@/src/theme";

type Choice = InvoiceLineAction | "pick";
type Sheet = "none" | "change" | "probable" | "variant" | "picker";
type Props = {
  line: InvoiceLineView;
  readOnly: boolean;
  onPatch: (body: InvoiceLinePatch) => void;
  onChooseProduct: (productId: string) => void;
};

export function InvoiceLineCard({ line, readOnly, onPatch, onChooseProduct }: Props) {
  const { t } = useI18n();
  const [sheet, setSheet] = useState<Sheet>("none");
  const close = () => setSheet("none");
  const state = lineState(line);
  const change = priceChange(line);
  const product = line.action === "create_draft" ? null : line.product;

  const meta = [
    line.quantity !== null ? `${line.quantity} ${line.unit ?? ""}`.trim() : null,
    line.lineTotalCents !== null ? formatEuros(line.lineTotalCents) : null,
    line.taxRatePct !== null ? t("invoice_line_tax", { rate: line.taxRatePct }) : null,
  ].filter(Boolean).join(" · ");

  const choices: Array<{ value: Choice; label: string }> = [
    ...(line.product
      ? [{ value: "update_price" as const, label: t(ACTION_KEY.update_price) }, { value: "connect" as const, label: t(ACTION_KEY.connect) }]
      : []),
    { value: "pick", label: t("invoice_line_choose_other") },
    { value: "create_draft", label: t(ACTION_KEY.create_draft) },
    { value: "ignore", label: t(ACTION_KEY.ignore) },
  ];

  const chooseSheet: Sheet = state === "probable" ? "probable" : state === "ambiguous" ? "variant" : "picker";

  return (
    <View style={styles.card}>
      <Text style={styles.paper}>{line.description}</Text>
      {meta ? <Text style={styles.meta}>{meta}</Text> : null}
      <Text style={styles.product}>{product ? product.name : t("invoice_line_new_product")}</Text>
      {change && line.action !== "create_draft" ? (
        <Text style={styles.price}>{`${formatEuros(change.beforeCents)} → ${formatEuros(change.afterCents)} (${change.pct > 0 ? "+" : ""}${change.pct} %)`}</Text>
      ) : null}
      {!readOnly && (line.action === "update_price" || line.action === "create_draft") ? (
        <EditableCell
          value={line.appliedPriceCents ?? 0}
          format={(v) => formatEuros(v)}
          parse={parseEurosToCents}
          onSave={async (v) => onPatch({ action: line.action!, priceCents: v })}
          width={104}
        />
      ) : null}
      {line.quantityLooksMisread ? <StatusBadge level="warning" label={t("invoice_warning_quantity")} /> : null}

      {readOnly ? (
        line.action ? <StatusBadge level="ok" label={t(DONE_KEY[line.action])} /> : null
      ) : (
        <View style={styles.actions}>
          {line.action ? <StatusBadge level="info" label={t(ACTION_KEY[line.action])} /> : null}
          {state === "tick" ? (
            <Button
              label={change ? t("invoice_line_confirm_big_change", { pct: Math.abs(change.pct) }) : t(ACTION_KEY.update_price)}
              onPress={() => onPatch({ action: "update_price" })}
            />
          ) : null}
          {state === "probable" || state === "ambiguous" || state === "choose" ? (
            <Button label={t("invoice_line_choose")} onPress={() => setSheet(chooseSheet)} />
          ) : null}
          <Button variant="ghost" label={t("invoice_line_change")} onPress={() => setSheet("change")} />
        </View>
      )}

      <ChoiceSheet<Choice>
        open={sheet === "change"}
        title={t("invoice_line_change")}
        options={choices}
        current={line.action ?? "pick"}
        onSelect={(value) => {
          if (value === "pick") {
            setSheet("picker");
            return;
          }
          close();
          onPatch({ action: value });
        }}
        onCancel={close}
      />
      {line.product ? (
        <ConfirmMatchSheet
          open={sheet === "probable"}
          rawText={line.description}
          candidateName={line.product.name}
          title={t("invoice_line_probable_title")}
          body={t("invoice_line_probable_body")}
          yesLabel={t("invoice_line_probable_yes")}
          noLabel={t("invoice_line_probable_no")}
          onYes={() => {
            close();
            onChooseProduct(line.product!.id);
          }}
          onNo={() => setSheet("picker")}
        />
      ) : null}
      <PickVariantSheet
        open={sheet === "variant"}
        rawText={line.description}
        candidates={line.siblings}
        title={t("invoice_line_variant_title")}
        body={t("invoice_line_variant_body")}
        noneLabel={t("invoice_line_variant_none")}
        onPick={(productId) => {
          close();
          onChooseProduct(productId);
        }}
        onNone={() => {
          close();
          onPatch({ action: "create_draft" });
        }}
      />
      <ProductPickerSheet
        open={sheet === "picker"}
        onPick={(productId) => {
          close();
          onChooseProduct(productId);
        }}
        onClose={close}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.xs, padding: spacing.md, borderRadius: radii.lg, borderWidth: 1,
    borderColor: colors.edgeSoft, backgroundColor: colors.paperSoft,
  },
  paper: { fontFamily: fonts.mono, fontSize: fontSizes.bodySm, color: colors.inkSoft },
  meta: { fontFamily: fonts.sans, fontSize: fontSizes.caption, color: colors.mute },
  product: { fontFamily: fonts.serifMedium, fontSize: fontSizes.serifBody, color: colors.ink },
  price: { fontFamily: fonts.mono, fontSize: fontSizes.body, color: colors.ink },
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm, marginTop: spacing.xs },
});
