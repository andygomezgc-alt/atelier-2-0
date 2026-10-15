// apps/api/lib/invoices/storage.ts
// Invoice photos and PDFs are private (spec "Errors → Privacy"): stored with access "private" and
// read back only by authenticated routes. Keys are never sent to clients.
import { randomUUID } from "node:crypto";
import { del, get, list, put } from "@vercel/blob";
import { logger } from "../logger";

export class InvoiceStorageError extends Error {}

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

function token(): string {
  const value = process.env.INVOICE_BLOB_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;
  if (!value) throw new InvoiceStorageError("invoice_storage_unconfigured");
  return value;
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

export async function storeInvoiceFile(restaurantId: string, invoiceId: string, buffer: Uint8Array, mimeType: string): Promise<string> {
  const pathname = `invoices/${restaurantId}/${invoiceId}/${randomUUID()}.${EXT[mimeType] ?? "bin"}`;
  const auth = token();
  try {
    const stored = await put(pathname, Buffer.from(buffer), { access: "private", contentType: mimeType, addRandomSuffix: false, token: auth });
    return stored.pathname;
  } catch (error) {
    logger.error("invoice_storage_put_failed", { message: message(error) });
    throw new InvoiceStorageError("invoice_storage_unavailable");
  }
}

export async function openInvoiceFile(storageKey: string): Promise<{ stream: ReadableStream<Uint8Array>; contentType: string } | null> {
  const result = await get(storageKey, { access: "private", token: token() });
  if (!result || result.statusCode !== 200) return null;
  return { stream: result.stream, contentType: result.blob.contentType };
}

export async function readInvoiceFile(storageKey: string): Promise<Uint8Array | null> {
  const file = await openInvoiceFile(storageKey);
  return file ? new Uint8Array(await new Response(file.stream).arrayBuffer()) : null;
}

export async function deleteInvoiceFiles(storageKeys: ReadonlyArray<string>): Promise<void> {
  if (storageKeys.length === 0) return;
  try {
    await del([...storageKeys], { token: token() });
  } catch (error) {
    logger.warn("invoice_storage_delete_failed", { count: storageKeys.length, message: message(error) });
  }
}

// Every invoice file of a restaurant that is being deleted. Its rows cascade from Restaurant;
// the files are found by their key prefix. Never throws: account deletion must finish.
export async function deleteRestaurantInvoiceFiles(restaurantId: string): Promise<void> {
  try {
    const auth = token();
    let cursor: string | undefined;
    do {
      const page = await list({ prefix: `invoices/${restaurantId}/`, cursor, token: auth });
      if (page.blobs.length > 0) await del(page.blobs.map((b) => b.pathname), { token: auth });
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
  } catch (error) {
    logger.warn("invoice_storage_restaurant_delete_failed", { restaurantId, message: message(error) });
  }
}
