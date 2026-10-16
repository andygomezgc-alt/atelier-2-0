// Sends what the chef scanned: the photos are the pages of one invoice, and each PDF is an
// invoice of its own. An invoice whose upload breaks halfway is deleted so it never lingers.
import { addInvoicePage, deleteInvoice, startInvoice, startInvoiceRead } from "@/src/api/invoices";
import type { PreparedFile } from "./invoice-image";

export type SendResult = { ids: string[]; failed: Array<ReadonlyArray<PreparedFile>>; error: unknown };

export async function sendInvoice(pages: ReadonlyArray<PreparedFile>): Promise<string> {
  const [first, ...rest] = pages;
  if (!first) throw new Error("invoice_without_pages");
  const { id } = await startInvoice(first.uri, first.mimeType);
  try {
    for (const page of rest) await addInvoicePage(id, page.uri, page.mimeType);
    await startInvoiceRead(id);
  } catch (error) {
    await deleteInvoice(id).catch(() => undefined);
    throw error;
  }
  return id;
}

export function invoiceBatches(photos: ReadonlyArray<PreparedFile>, pdfs: ReadonlyArray<PreparedFile>): PreparedFile[][] {
  return [...(photos.length > 0 ? [[...photos]] : []), ...pdfs.map((pdf) => [pdf])];
}

export async function sendInvoices(batches: ReadonlyArray<ReadonlyArray<PreparedFile>>): Promise<SendResult> {
  const result: SendResult = { ids: [], failed: [], error: null };
  for (const batch of batches) {
    try {
      result.ids.push(await sendInvoice(batch));
    } catch (error) {
      result.failed.push(batch);
      result.error = error;
    }
  }
  return result;
}
