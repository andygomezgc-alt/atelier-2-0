import { createIsomorphicCanvasFactory, getDocumentProxy, renderPageAsImage } from "unpdf";
import type { AiPart } from "./types";

const MAX_PAGES = 10;
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

/** Render every PDF page locally: preserve visual layout using documented GLM image input. */
export async function visionParts(buffer: Uint8Array, mimeType: string): Promise<AiPart[]> {
  if (!buffer.byteLength || buffer.byteLength > MAX_BYTES) throw new Error("ai_media_size_limit");
  if (mimeType !== "application/pdf") {
    if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) throw new Error("ai_media_type_invalid");
    if (buffer.byteLength > MAX_IMAGE_BYTES) throw new Error("ai_media_size_limit");
    return [{ type: "image_url", image_url: { url: `data:${mimeType};base64,${Buffer.from(buffer).toString("base64")}` } }];
  }
  // PDF.js may transfer its input. Keep the original intact for reuse/upload.
  const CanvasFactory = await createIsomorphicCanvasFactory(() => import("@napi-rs/canvas"));
  const doc = await getDocumentProxy(new Uint8Array(buffer), { CanvasFactory, isEvalSupported: false, useSystemFonts: false });
  try {
    if (doc.numPages < 1 || doc.numPages > MAX_PAGES) throw new Error("ai_media_page_limit");
    const parts: AiPart[] = [];
    let imageBytes = 0;
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const scale = Math.min(3, 2200 / Math.max(viewport.width, viewport.height));
      if (!Number.isFinite(scale) || scale <= 0) throw new Error("ai_media_invalid");
      const dataUrl = await renderPageAsImage(doc, pageNumber, {
        scale, toDataURL: true, canvasImport: () => import("@napi-rs/canvas"),
      });
      const png = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
      imageBytes += png.byteLength;
      if (png.byteLength > MAX_IMAGE_BYTES || imageBytes > 20 * 1024 * 1024) throw new Error("ai_media_size_limit");
      parts.push({ type: "text", text: `Página ${pageNumber} de ${doc.numPages} del documento.` },
        { type: "image_url", image_url: { url: `data:image/png;base64,${png.toString("base64")}` } });
      page.cleanup();
    }
    return parts;
  } finally { await doc.destroy(); }
}
