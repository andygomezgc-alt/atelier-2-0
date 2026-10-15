// Guards against the model skipping rows in dense tables: the read lines must add up to the totals
// printed on the invoice, allowing one cent of rounding per line. Multi-page invoices are merged first.
import type { ExtractedInvoiceLine, ExtractedInvoicePage } from "./extraction";

export type InvoiceHeader = {
  supplierName: string | null;
  supplierTaxId: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  netTotalCents: number | null;
  taxTotalCents: number | null;
  grossTotalCents: number | null;
};

export type MergedInvoice = { header: InvoiceHeader; lines: ExtractedInvoiceLine[]; droppedLines: number; invoicePages: number };

const IDENTITY = ["supplierName", "supplierTaxId", "invoiceNumber", "invoiceDate"] as const;
const TOTALS = ["netTotalCents", "taxTotalCents", "grossTotalCents"] as const;

// Who and when are printed on the first page; the totals at the end of the last one.
export function mergeInvoicePages(pages: ReadonlyArray<ExtractedInvoicePage>): MergedInvoice {
  const invoice = pages.filter((p) => p.isInvoice);
  const header = {} as InvoiceHeader;
  for (const key of IDENTITY) header[key] = invoice.find((p) => p[key] !== null)?.[key] ?? null;
  for (const key of TOTALS) header[key] = [...invoice].reverse().find((p) => p[key] !== null)?.[key] ?? null;
  return {
    header,
    lines: invoice.flatMap((p) => p.lines),
    droppedLines: invoice.reduce((n, p) => n + p.droppedLines, 0),
    invoicePages: invoice.length,
  };
}

export type TotalsCheck = { status: "ok" | "mismatch" | "unknown"; sumCents: number | null; diffCents: number | null };

export function checkInvoiceTotals(
  lines: ReadonlyArray<{ lineTotalCents: number | null; taxRatePct: number | null }>,
  totals: { netTotalCents: number | null; grossTotalCents: number | null },
): TotalsCheck {
  const priced = lines.filter((l): l is { lineTotalCents: number; taxRatePct: number | null } => l.lineTotalCents !== null);
  if (priced.length === 0) return { status: "unknown", sumCents: null, diffCents: null };
  const sumCents = priced.reduce((a, l) => a + l.lineTotalCents, 0);
  const tolerance = Math.max(2, priced.length);
  const diffs: number[] = [];
  if (totals.netTotalCents !== null) diffs.push(sumCents - totals.netTotalCents);
  // The model may compute a net that is not printed; the printed gross catches that when every line has a rate.
  if (totals.grossTotalCents !== null && priced.every((l) => l.taxRatePct !== null)) {
    const grossSum = priced.reduce((a, l) => a + Math.round(l.lineTotalCents * (1 + (l.taxRatePct as number) / 100)), 0);
    diffs.push(grossSum - totals.grossTotalCents);
  }
  if (diffs.length === 0) return { status: "unknown", sumCents, diffCents: null };
  const failing = diffs.find((d) => Math.abs(d) > tolerance);
  return failing === undefined ? { status: "ok", sumCents, diffCents: diffs[0]! } : { status: "mismatch", sumCents, diffCents: failing };
}
