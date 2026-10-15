// apps/api/lib/invoices/upload.ts
// Validates one uploaded invoice page (multipart field "file"): type, real content and size.
// Same limits as recipe uploads: photos 6 MB, PDFs 10 MB.
import { fileMatchesMime, IMAGE_MIMES, PDF_MIME } from "../recipe-extraction";

export const MAX_INVOICE_PAGES = 10;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_PDF_BYTES = 10 * 1024 * 1024;

export type UploadedPage = { buffer: Uint8Array; mimeType: string; sizeBytes: number };
export type UploadRejection = { status: 400 | 413 | 415; body: { error: string; code: "file_invalid" } };

const BY_EXTENSION: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: PDF_MIME };

// Expo on Android can send an empty or generic type: fall back to the file name's extension.
function inferMime(declared: string, fileName: string): string {
  if (declared && declared !== "application/octet-stream") return declared;
  return BY_EXTENSION[fileName.toLowerCase().split(".").pop() ?? ""] ?? declared;
}

const reject = (status: UploadRejection["status"], error: string): UploadRejection => ({ status, body: { error, code: "file_invalid" } });

export async function readUploadedPage(form: FormData, opts: { imagesOnly: boolean }): Promise<UploadedPage | UploadRejection> {
  const file = form.get("file");
  if (!file || !(file instanceof Blob)) return reject(400, "Missing file");
  const mimeType = inferMime(file.type, file instanceof File ? file.name : "");
  const isImage = (IMAGE_MIMES as readonly string[]).includes(mimeType);
  if (!isImage && (opts.imagesOnly || mimeType !== PDF_MIME)) return reject(415, "Unsupported file type");
  if (file.size > (isImage ? MAX_IMAGE_BYTES : MAX_PDF_BYTES)) return reject(413, "File too large");
  const buffer = new Uint8Array(await file.arrayBuffer());
  if (!fileMatchesMime(buffer, mimeType)) return reject(415, "File does not match its type");
  return { buffer, mimeType, sizeBytes: file.size };
}
