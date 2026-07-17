import { del, put } from "@vercel/blob";
import { logger } from "./logger";
import { fileMatchesMime } from "./recipe-extraction";

export const ALLOWED_PHOTO_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024; // 8 MB

function isVercelBlobUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname;
    return (
      hostname === "blob.vercel-storage.com" ||
      hostname.endsWith(".blob.vercel-storage.com")
    );
  } catch {
    return false;
  }
}

export async function deleteBlobs(
  urls: Array<string | null | undefined>,
): Promise<void> {
  const blobUrls = urls.filter(
    (url): url is string => typeof url === "string" && isVercelBlobUrl(url),
  );
  if (blobUrls.length === 0) return;

  try {
    await del(blobUrls);
  } catch (err) {
    logger.warn("blob_delete_failed", {
      error: err instanceof Error ? err.message : String(err),
      count: blobUrls.length,
    });
  }
}

export type PhotoValidationError =
  | { ok: false; reason: "mime"; allowed: readonly string[] }
  | { ok: false; reason: "size"; max: number }
  | { ok: false; reason: "content" };

export function validatePhoto(
  buffer: Buffer,
  contentType: string,
): { ok: true } | PhotoValidationError {
  if (!ALLOWED_PHOTO_MIMES.includes(contentType as (typeof ALLOWED_PHOTO_MIMES)[number])) {
    return { ok: false, reason: "mime", allowed: ALLOWED_PHOTO_MIMES };
  }
  if (buffer.byteLength > MAX_PHOTO_BYTES) {
    return { ok: false, reason: "size", max: MAX_PHOTO_BYTES };
  }
  // P2-1 (auditoría jul 2026): el contenido real debe coincidir con el MIME
  // declarado (magic bytes). El content-type del form es lo que el cliente
  // dice que es, no lo que el archivo realmente es.
  if (!fileMatchesMime(buffer, contentType)) {
    return { ok: false, reason: "content" };
  }
  return { ok: true };
}

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export async function uploadPhoto(
  buffer: Buffer,
  prefix: string,
  contentType = "image/jpeg",
): Promise<string | null> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    logger.warn("blob_token_missing", { prefix });
    return null;
  }
  const ext = EXT_BY_MIME[contentType] ?? "jpg";
  const filename = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  try {
    const blob = await put(filename, buffer, {
      access: "public",
      contentType,
      token,
    });
    logger.info("blob_uploaded", { filename, bytes: buffer.byteLength });
    return blob.url;
  } catch (err) {
    logger.error("blob_upload_failed", {
      err: err instanceof Error ? err.message : String(err),
      filename,
    });
    throw err;
  }
}
