import { put } from "@vercel/blob";

export async function uploadPhoto(
  buffer: Buffer,
  prefix: string,
  contentType = "image/jpeg",
): Promise<string | null> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    console.warn("BLOB_READ_WRITE_TOKEN not set; skipping upload");
    return null;
  }
  const filename = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const blob = await put(filename, buffer, {
    access: "public",
    contentType,
    token,
  });
  return blob.url;
}
