import { put } from "@vercel/blob";
import { logger } from "./logger";

export const ALLOWED_PHOTO_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024; // 8 MB

export type PhotoValidationError =
  | { ok: false; reason: "mime"; allowed: readonly string[] }
  | { ok: false; reason: "size"; max: number };

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
  return { ok: true };
}

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
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
