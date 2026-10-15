// apps/api/lib/invoices/upload.ts
// Validates one uploaded invoice page (multipart field "file"): type, real content and size.
// Vercel refuses request bodies over 4.5 MB before the route runs, so every file stays under
// 4 MB: the app compresses photos to fit, and a heavier PDF is refused with its own code.
import { fileMatchesMime, IMAGE_MIMES, PDF_MIME } from "../recipe-extraction";

export const MAX_INVOICE_PAGES = 10;
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export type UploadedPage = { buffer: Uint8Array; mimeType: string; sizeBytes: number };
export type UploadRejection = { status: 400 | 413 | 415; body: { error: string; code: "file_invalid" | "file_too_large" } };

const BY_EXTENSION: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: PDF_MIME };

// Expo on Android can send an empty or generic type: fall back to the file name's extension.
function inferMime(declared: string, fileName: string): string {
  if (declared && declared !== "application/octet-stream") return declared;
  return BY_EXTENSION[fileName.toLowerCase().split(".").pop() ?? ""] ?? declared;
}

const reject = (status: UploadRejection["status"], error: string, code: UploadRejection["body"]["code"] = "file_invalid"): UploadRejection =>
  ({ status, body: { error, code } });

export async function readUploadedPage(form: FormData, opts: { imagesOnly: boolean }): Promise<UploadedPage | UploadRejection> {
  const file = form.get("file");
  if (!file || !(file instanceof Blob)) return reject(400, "Missing file");
  const mimeType = inferMime(file.type, file instanceof File ? file.name : "");
  const isImage = (IMAGE_MIMES as readonly string[]).includes(mimeType);
  if (!isImage && (opts.imagesOnly || mimeType !== PDF_MIME)) return reject(415, "Unsupported file type");
  if (file.size > MAX_UPLOAD_BYTES) return reject(413, "File too large", "file_too_large");
  const buffer = new Uint8Array(await file.arrayBuffer());
  if (!fileMatchesMime(buffer, mimeType)) return reject(415, "File does not match its type");
  return { buffer, mimeType, sizeBytes: file.size };
}
