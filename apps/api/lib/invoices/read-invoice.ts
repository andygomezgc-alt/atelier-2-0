// apps/api/lib/invoices/read-invoice.ts
// The background read of one uploaded invoice (runs in after()). Every exit leaves the
// invoice in "review" or in "failed" with a reason; writes are fenced on status "reading"
// so a retried or timed-out read never overwrites a newer state.
import { prisma } from "@atelier/db";
import { recordAiTokens, reserveAiCall } from "../ai-quota";
import { AiBudgetError } from "../ai/budget-policy";
import { logger } from "../logger";
import { extractInvoicePage, InvoiceExtractionError, type ExtractedInvoicePage } from "./extraction";
import { normalizeSupplierName, type SecondLook } from "./line-matching";
import { proposeInvoiceLines } from "./propose";
import { secondLook } from "./second-look";
import { InvoiceStorageError, readInvoiceFile } from "./storage";
import { mergeInvoicePages } from "./totals";

export const READ_DEADLINE_MS = 270_000;

export type InvoiceFailureReason =
  | "ai_quota" | "ai_unavailable" | "unreadable" | "file_missing" | "storage_unavailable"
  | "not_an_invoice" | "no_lines" | "read_timeout" | "internal_error";

class ReadFailure extends Error {
  constructor(readonly reason: InvoiceFailureReason) { super(reason); }
}

function reasonFor(error: unknown): InvoiceFailureReason {
  if (error instanceof ReadFailure) return error.reason;
  if (error instanceof InvoiceStorageError) return "storage_unavailable";
  if (error instanceof InvoiceExtractionError) return "unreadable";
  if (error instanceof AiBudgetError) return "ai_unavailable";
  const message = error instanceof Error ? error.message : "";
  if (message === "invoice_extraction_incomplete") return "unreadable";
  if (message.startsWith("ai_")) return "ai_unavailable";
  return "internal_error";
}

async function markFailed(invoiceId: string, reason: InvoiceFailureReason) {
  await prisma.invoice.updateMany({ where: { id: invoiceId, status: "reading" }, data: { status: "failed", failureReason: reason } });
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

async function upsertSupplier(restaurantId: string, name: string | null, taxId: string | null): Promise<string | null> {
  const nameNorm = normalizeSupplierName(name ?? "");
  if (!name || nameNorm === "") return null;
  try {
    const supplier = await prisma.supplier.upsert({
      where: { restaurantId_nameNorm: { restaurantId, nameNorm } },
      create: { restaurantId, name: name.trim(), nameNorm, taxId },
      update: taxId ? { taxId } : {},
      select: { id: true },
    });
    return supplier.id;
  } catch (error) {
    // Two reads of the same new supplier race on the unique key: the loser reuses the winner's row.
    if ((error as { code?: unknown }).code !== "P2002") throw error;
    const existing = await prisma.supplier.findUnique({ where: { restaurantId_nameNorm: { restaurantId, nameNorm } }, select: { id: true } });
    return existing?.id ?? null;
  }
}

export async function readInvoice(invoiceId: string, deadline: number): Promise<void> {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, status: "reading", deletedAt: null },
    select: { id: true, restaurantId: true, uploadedById: true, createdAt: true, pages: { orderBy: { position: "asc" }, select: { position: true, storageKey: true, mimeType: true } } },
  });
  if (!invoice) return;
  const userId = invoice.uploadedById;
  const onUsage = userId
    ? (usage: { inputTokens: number; outputTokens: number }) => { recordAiTokens(userId, usage.inputTokens, usage.outputTokens).catch(() => undefined); }
    : undefined;

  try {
    const pages: ExtractedInvoicePage[] = [];
    for (const page of invoice.pages) {
      if (Date.now() >= deadline) throw new ReadFailure("read_timeout");
      if (userId && !(await reserveAiCall(userId)).ok) throw new ReadFailure("ai_quota");
      const bytes = await readInvoiceFile(page.storageKey);
      if (!bytes) throw new ReadFailure("file_missing");
      pages.push(await extractInvoicePage(bytes, page.mimeType, onUsage));
    }
    const merged = mergeInvoicePages(pages);
    if (merged.invoicePages === 0) throw new ReadFailure("not_an_invoice");
    if (merged.lines.length === 0) throw new ReadFailure("no_lines");

    const { header } = merged;
    const supplierId = await upsertSupplier(invoice.restaurantId, header.supplierName, header.supplierTaxId);
    const issuedOn = header.invoiceDate && DATE.test(header.invoiceDate) ? header.invoiceDate : null;
    // The second look is one more AI call: without quota left the chef simply reviews more lines.
    const look: SecondLook = async (requests) =>
      userId && !(await reserveAiCall(userId)).ok ? new Map() : secondLook(requests, onUsage);
    const proposed = await proposeInvoiceLines({
      restaurantId: invoice.restaurantId,
      supplierId,
      invoiceDate: issuedOn ?? invoice.createdAt.toISOString().slice(0, 10),
      lines: merged.lines,
      secondLook: look,
    });

    await prisma.$transaction(async (tx) => {
      const claimed = await tx.invoice.updateMany({
        where: { id: invoiceId, status: "reading" },
        data: {
          status: "review", failureReason: null, supplierId, number: header.invoiceNumber,
          issuedOn: issuedOn ? new Date(`${issuedOn}T00:00:00Z`) : null,
          netTotalCents: header.netTotalCents, taxTotalCents: header.taxTotalCents, grossTotalCents: header.grossTotalCents,
        },
      });
      if (claimed.count === 0) return;
      await tx.invoiceLine.deleteMany({ where: { invoiceId } });
      await tx.invoiceLine.createMany({
        data: proposed.map((l) => ({
          invoiceId, position: l.position, description: l.description, code: l.code, quantity: l.quantity, unit: l.unit,
          packQty: l.packQty, packUnit: l.packUnit, unitPriceCents: l.unitPriceCents, taxRatePct: l.taxRatePct,
          lineTotalCents: l.lineTotalCents, productId: l.productId, matchLevel: l.matchLevel, action: l.action,
          appliedPriceCents: l.appliedPriceCents,
        })),
      });
    });
    logger.info("invoice_read", { invoiceId, pages: pages.length, lines: proposed.length, droppedLines: merged.droppedLines });
  } catch (error) {
    const reason = reasonFor(error);
    if (reason === "internal_error") throw error;
    logger.warn("invoice_read_failed", { invoiceId, reason, message: error instanceof Error ? error.message : String(error) });
    await markFailed(invoiceId, reason);
  }
}

export async function readInvoiceSafely(invoiceId: string): Promise<void> {
  try {
    await readInvoice(invoiceId, Date.now() + READ_DEADLINE_MS);
  } catch (error) {
    logger.error("invoice_read_crashed", { invoiceId, message: error instanceof Error ? error.message : String(error) });
    await markFailed(invoiceId, "internal_error").catch(() => undefined);
  }
}
