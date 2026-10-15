// Supplier invoices: send the pages, follow the read, decide each line, apply.
// Uploads go through FileSystem.uploadAsync: fetch + FormData fails in standalone builds.
import * as FileSystem from "expo-file-system/legacy";
import type {
  ApiErrorCode, InvoiceDetail, InvoiceHeaderPatch, InvoiceLineAction, InvoiceLinePatch, InvoiceListResponse, InvoiceMatchLevel,
} from "@atelier/shared";
import * as SecureStore from "@/src/lib/secure-storage";
import { ApiError, apiFetch, BASE, NetworkError, TOKEN_KEY } from "./client";

export type InvoiceLineDecision = {
  position: number;
  action: InvoiceLineAction;
  productId: string | null;
  appliedPriceCents: number | null;
  matchLevel: InvoiceMatchLevel;
};
export type InvoiceApplySkipped = { position: number; reason: "product_deleted" | "newer_price" };
export type InvoiceApplyResult =
  | { alreadyApplied: true }
  | { alreadyApplied?: undefined; updated: number; drafts: number; connected: number; ignored: number; skipped: InvoiceApplySkipped[] };

async function authHeaders(): Promise<Record<string, string>> {
  const token = await SecureStore.getItemAsync(TOKEN_KEY).catch(() => null);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function upload<T>(path: string, uri: string, mimeType: string): Promise<T> {
  const headers = await authHeaders();
  let res: FileSystem.FileSystemUploadResult;
  try {
    res = await FileSystem.uploadAsync(`${BASE}${path}`, uri, {
      httpMethod: "POST",
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: "file",
      mimeType,
      headers,
    });
  } catch {
    throw new NetworkError();
  }
  if (res.status < 200 || res.status >= 300) {
    let message = `HTTP ${res.status}`;
    let code: ApiErrorCode | undefined;
    try {
      const json = JSON.parse(res.body);
      message = json?.error ?? message;
      if (typeof json?.code === "string") code = json.code as ApiErrorCode;
    } catch {}
    throw new ApiError(res.status, message, code);
  }
  return JSON.parse(res.body) as T;
}

export const listInvoices = () => apiFetch<InvoiceListResponse>("/api/invoices");
export const getInvoice = (id: string) => apiFetch<InvoiceDetail>(`/api/invoices/${id}`);
export const startInvoice = (uri: string, mimeType: string) => upload<{ id: string; pages: number }>("/api/invoices", uri, mimeType);
export const addInvoicePage = (id: string, uri: string, mimeType: string) =>
  upload<{ position: number }>(`/api/invoices/${id}/pages`, uri, mimeType);
export const startInvoiceRead = (id: string) => apiFetch<unknown>(`/api/invoices/${id}/read`, { method: "POST" });
export const retryInvoice = (id: string) => apiFetch<unknown>(`/api/invoices/${id}/retry`, { method: "POST" });
export const deleteInvoice = (id: string) => apiFetch<unknown>(`/api/invoices/${id}`, { method: "DELETE" });
export const patchInvoiceHeader = (id: string, body: InvoiceHeaderPatch) =>
  apiFetch<{ ok: true }>(`/api/invoices/${id}`, { method: "PATCH", body: JSON.stringify(body) });
export const patchInvoiceLine = (id: string, position: number, body: InvoiceLinePatch) =>
  apiFetch<InvoiceLineDecision>(`/api/invoices/${id}/lines/${position}`, { method: "PATCH", body: JSON.stringify(body) });
export const applyInvoice = (id: string) => apiFetch<InvoiceApplyResult>(`/api/invoices/${id}/apply`, { method: "POST" });

// Picking a product updates its price when the line's price converts to the product's unit;
// when it does not, the server answers price_required and the line is only linked.
export async function chooseProduct(id: string, position: number, productId: string): Promise<InvoiceLineDecision> {
  try {
    return await patchInvoiceLine(id, position, { action: "update_price", productId });
  } catch (error) {
    if (error instanceof ApiError && error.code === "price_required") return patchInvoiceLine(id, position, { action: "connect", productId });
    throw error;
  }
}

// The original pages are private: an <Image> or a download needs the session token.
export async function invoicePageSource(id: string, position: number): Promise<{ uri: string; headers: Record<string, string> }> {
  return { uri: `${BASE}/api/invoices/${id}/pages/${position}`, headers: await authHeaders() };
}
