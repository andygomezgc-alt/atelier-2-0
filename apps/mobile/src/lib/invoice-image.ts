// Every invoice file must reach the server under Vercel's 4.5 MB request limit (the API
// refuses more than 4 MB). Photos are re-encoded as JPEG — which also turns iPhone HEIC into
// a type the server reads — with the long side at most 2400 px; a second, smaller pass runs
// when the first is still too heavy. A PDF cannot be shrunk here: over 4 MB it is refused.
import * as FileSystem from "expo-file-system/legacy";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const PHOTO_TARGET_BYTES = 3.5 * 1024 * 1024;
const PASSES = [
  { longSide: 2400, compress: 0.7 },
  { longSide: 1800, compress: 0.5 },
] as const;

export type PickedFile = { uri: string; mimeType?: string | null; size?: number | null; width?: number; height?: number };
export type PreparedFile = { uri: string; mimeType: string };

export class InvoiceFileTooLargeError extends Error {
  constructor() {
    super("invoice_file_too_large");
  }
}

async function sizeOf(uri: string): Promise<number> {
  const info = await FileSystem.getInfoAsync(uri);
  return info.exists && typeof info.size === "number" ? info.size : Number.POSITIVE_INFINITY;
}

async function encodePhoto(file: PickedFile, pass: (typeof PASSES)[number]): Promise<string> {
  const width = file.width ?? 0;
  const height = file.height ?? 0;
  const context = ImageManipulator.manipulate(file.uri);
  if (Math.max(width, height) > pass.longSide) context.resize(width >= height ? { width: pass.longSide } : { height: pass.longSide });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ compress: pass.compress, format: SaveFormat.JPEG });
  return saved.uri;
}

export async function prepareInvoiceFile(file: PickedFile): Promise<PreparedFile> {
  const isPdf = file.mimeType === "application/pdf" || file.uri.toLowerCase().endsWith(".pdf");
  if (isPdf) {
    const size = file.size ?? (await sizeOf(file.uri));
    if (size > MAX_UPLOAD_BYTES) throw new InvoiceFileTooLargeError();
    return { uri: file.uri, mimeType: "application/pdf" };
  }
  for (const pass of PASSES) {
    const uri = await encodePhoto(file, pass);
    if ((await sizeOf(uri)) <= PHOTO_TARGET_BYTES) return { uri, mimeType: "image/jpeg" };
  }
  throw new InvoiceFileTooLargeError();
}
