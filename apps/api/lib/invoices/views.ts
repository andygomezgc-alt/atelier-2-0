// apps/api/lib/invoices/views.ts
// Response shapes for the invoice routes, and the stuck-read sweep.
import { prisma } from "@atelier/db";
import type { InvoiceListResponse, InvoiceSummary } from "@atelier/shared";

// A read that has not finished in 10 minutes died with its function (the read itself
// stops at 4.5 minutes). Expired when the list or the detail is loaded, so the chef can retry.
export const STUCK_READ_MS = 10 * 60 * 1000;

export async function expireStuckReads(restaurantId: string, now: Date): Promise<void> {
  await prisma.invoice.updateMany({
    where: { restaurantId, status: "reading", updatedAt: { lt: new Date(+now - STUCK_READ_MS) } },
    data: { status: "failed", failureReason: "read_timeout" },
  });
}

type SummaryRow = {
  id: string; status: InvoiceSummary["status"]; number: string | null; issuedOn: Date | null;
  grossTotalCents: number | null; netTotalCents: number | null; failureReason: string | null; createdAt: Date;
};

export function toInvoiceSummary(row: SummaryRow): InvoiceSummary {
  return {
    id: row.id, status: row.status, number: row.number,
    issuedOn: row.issuedOn ? row.issuedOn.toISOString().slice(0, 10) : null,
    grossTotalCents: row.grossTotalCents, netTotalCents: row.netTotalCents,
    failureReason: row.failureReason, createdAt: row.createdAt.toISOString(),
  };
}

// The date that orders the archive: the printed date, else the upload day.
const sortDate = (row: SummaryRow) => (row.issuedOn ?? row.createdAt).getTime();

export function groupBySupplier(rows: ReadonlyArray<SummaryRow & { supplier: { id: string; name: string } | null }>): InvoiceListResponse["suppliers"] {
  const sorted = [...rows].sort((a, b) => sortDate(b) - sortDate(a) || b.createdAt.getTime() - a.createdAt.getTime());
  const groups = new Map<string, InvoiceListResponse["suppliers"][number]>();
  for (const row of sorted) {
    const key = row.supplier?.id ?? "";
    if (!groups.has(key)) groups.set(key, { supplier: row.supplier, invoices: [] });
    groups.get(key)!.invoices.push(toInvoiceSummary(row));
  }
  return [...groups.values()];
}
