// How an invoice and its lines read on screen: badges, plain failure reasons, the price
// before → after, what each undecided line still needs, and the header form's days.
import type { InvoiceDetail, InvoiceHeaderPatch, InvoiceLineAction, InvoiceLineView, InvoiceStatus, InvoiceSummary } from "@atelier/shared";
import type { TranslationKey } from "@atelier/i18n";
import type { StatusLevel } from "@/src/components/StatusBadge";

export const STATUS_BADGE: Record<InvoiceStatus, { level: StatusLevel; key: TranslationKey }> = {
  uploading: { level: "info", key: "invoice_status_uploading" },
  reading: { level: "info", key: "invoice_status_reading" },
  review: { level: "warning", key: "invoice_status_review" },
  applied: { level: "ok", key: "invoice_status_applied" },
  failed: { level: "error", key: "invoice_status_failed" },
};

const FAILURE_KEY: Record<string, TranslationKey> = {
  ai_quota: "invoice_failure_ai_quota",
  ai_unavailable: "invoice_failure_ai_unavailable",
  unreadable: "invoice_failure_unreadable",
  file_missing: "invoice_failure_file_missing",
  storage_unavailable: "invoice_failure_storage_unavailable",
  not_an_invoice: "invoice_failure_not_an_invoice",
  no_lines: "invoice_failure_no_lines",
  read_timeout: "invoice_failure_read_timeout",
  internal_error: "invoice_failure_internal_error",
};
export const failureKey = (reason: string | null): TranslationKey =>
  (reason ? FAILURE_KEY[reason] : undefined) ?? "invoice_failure_internal_error";

export const ACTION_KEY: Record<InvoiceLineAction, TranslationKey> = {
  update_price: "invoice_action_update_price",
  connect: "invoice_action_connect",
  create_draft: "invoice_action_create_draft",
  ignore: "invoice_action_ignore",
};
export const DONE_KEY: Record<InvoiceLineAction, TranslationKey> = {
  update_price: "invoice_done_update_price",
  connect: "invoice_done_connect",
  create_draft: "invoice_done_create_draft",
  ignore: "invoice_done_ignore",
};

// The product's bank price against the one this invoice brings, both in the product's unit.
export function priceChange(line: InvoiceLineView): { beforeCents: number; afterCents: number; pct: number } | null {
  if (!line.product || line.appliedPriceCents === null || line.product.precioCompra <= 0) return null;
  const before = line.product.precioCompra;
  const after = line.appliedPriceCents;
  return { beforeCents: before, afterCents: after, pct: Math.round(((after - before) / before) * 100) };
}

// What an undecided line waits for: a variant to pick, a probable match to confirm, a big
// price change to tick (20 % or more is never applied silently), or a product to choose.
export type LineState = "decided" | "tick" | "probable" | "ambiguous" | "choose";
export function lineState(line: InvoiceLineView): LineState {
  if (line.action !== null) return "decided";
  if (line.matchLevel === "ambiguo") return "ambiguous";
  if (line.matchLevel === "probable" && line.product) return "probable";
  if (line.product && line.appliedPriceCents !== null) return "tick";
  return "choose";
}

export const undecidedPositions = (lines: ReadonlyArray<InvoiceLineView>) => lines.filter((l) => l.action === null).map((l) => l.position);

export const invoiceDay = (inv: Pick<InvoiceSummary, "issuedOn" | "createdAt">) => inv.issuedOn ?? inv.createdAt.slice(0, 10);
export const formatDay = (day: string, locale: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString(locale, { timeZone: "UTC" });

// "15/10/2026", "5.3.2026" or "5-3-2026" → "2026-10-15"; a day that does not exist → null.
export function parseDayInput(raw: string): string | null {
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(raw.trim());
  if (!m) return null;
  const day = `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  const date = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(+date) && date.toISOString().slice(0, 10) === day ? day : null;
}
export const formatDayInput = (day: string) => day.split("-").reverse().join("/");

export type HeaderForm = { supplier: { kind: "existing"; id: string } | { kind: "new"; name: string }; number: string; day: string };

// Only what the chef changed goes to the server.
export function buildHeaderPatch(
  invoice: Pick<InvoiceDetail, "supplier" | "number" | "issuedOn">,
  form: HeaderForm,
): InvoiceHeaderPatch | "invalid_date" {
  const patch: InvoiceHeaderPatch = {};
  if (form.supplier.kind === "existing" && form.supplier.id !== invoice.supplier?.id) patch.supplierId = form.supplier.id;
  if (form.supplier.kind === "new" && form.supplier.name.trim() !== "") patch.supplierName = form.supplier.name.trim();
  const number = form.number.trim();
  if (number !== (invoice.number ?? "")) patch.number = number === "" ? null : number;
  const rawDay = form.day.trim();
  const day = rawDay === "" ? null : parseDayInput(rawDay);
  if (rawDay !== "" && day === null) return "invalid_date";
  if (day !== invoice.issuedOn) patch.issuedOn = day;
  return patch;
}
