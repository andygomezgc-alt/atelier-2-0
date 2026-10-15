// apps/api/lib/invoices/purge.ts
// Daily, from /api/cron/purge-trash: deletes for good the invoices in the trash for more than
// TRASH_RETENTION_DAYS and the uploads abandoned for a day, then their private files.
// Files go only after the rows are gone, so a failed delete never leaves an invoice without pages.
import { prisma } from "@atelier/db";
import { logger } from "../logger";
import { TRASH_RETENTION_DAYS } from "../trash-purge";
import { deleteInvoiceFiles } from "./storage";

export const ABANDONED_UPLOAD_MS = 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type InvoicePurgeResult = { invoices: number; files: number; failed: number; complete: boolean };

export async function purgeExpiredInvoices(now: Date, opts: { batchSize?: number; budgetMs?: number } = {}): Promise<InvoicePurgeResult> {
  const batchSize = opts.batchSize ?? 200;
  const deadline = Date.now() + (opts.budgetMs ?? 30_000);
  const expired = {
    OR: [
      { deletedAt: { lt: new Date(+now - TRASH_RETENTION_DAYS * DAY_MS) } },
      { status: "uploading" as const, deletedAt: null, createdAt: { lt: new Date(+now - ABANDONED_UPLOAD_MS) } },
    ],
  };
  const result: InvoicePurgeResult = { invoices: 0, files: 0, failed: 0, complete: false };
  const skipped: string[] = [];

  for (;;) {
    if (Date.now() >= deadline) break;
    const ids = (await prisma.invoice.findMany({
      where: skipped.length ? { ...expired, id: { notIn: skipped } } : expired,
      select: { id: true }, orderBy: { createdAt: "asc" }, take: batchSize,
    })).map((row) => row.id);
    if (ids.length === 0) { result.complete = true; break; }
    try {
      const removed = await prisma.$transaction(async (tx) => {
        const pages = await tx.invoicePage.findMany({ where: { invoice: { id: { in: ids }, ...expired } }, select: { storageKey: true } });
        const { count } = await tx.invoice.deleteMany({ where: { id: { in: ids }, ...expired } });
        return { count, keys: pages.map((p) => p.storageKey) };
      });
      result.invoices += removed.count;
      result.files += removed.keys.length;
      await deleteInvoiceFiles(removed.keys);
    } catch (error) {
      skipped.push(...ids);
      result.failed += ids.length;
      logger.error("invoice_purge_batch_failed", { size: ids.length, message: error instanceof Error ? error.message : String(error) });
    }
    if (ids.length < batchSize) { result.complete = true; break; }
  }
  logger.info("invoice_purge_finished", result);
  return result;
}
