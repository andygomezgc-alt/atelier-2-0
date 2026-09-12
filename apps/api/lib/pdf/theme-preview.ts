import { getDocumentProxy } from "unpdf";
import { renderHtmlToPdf } from "./render";
import type { FontVariant } from "./font-validation";

// Solo la muestra usada al configurar un estilo. No limita los menús del usuario.
const MAX_PREVIEW_BYTES = 4 * 1024 * 1024;
const MAX_PREVIEW_PAGES = 4;

/** Fallos de composición reparables; errores de Chromium/PDF.js no se reintentan. */
export class MenuThemePreviewError extends Error {
  constructor(code: string) {
    super(code);
    this.name = "MenuThemePreviewError";
  }
}

function normalizedText(text: string): string {
  return text.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}

/**
 * El mismo PDF paginado que imprime Chromium, nunca un screenshot del viewport.
 * Antes de enviarlo a visión limitamos tamaño/páginas y comprobamos que los
 * nombres de muestra sobrevivieron a la impresión (p. ej. overflow:hidden).
 * La presencia del texto no garantiza contraste, alineación ni ausencia de solapes.
 */
export async function renderThemePreview(
  html: string,
  requiredText: readonly string[],
  expectedPageSize?: { widthMm: number; heightMm: number },
  variants?: FontVariant[],
  maxPages = MAX_PREVIEW_PAGES,
): Promise<Buffer> {
  const pdf = await renderHtmlToPdf(html, variants);
  if (pdf.byteLength === 0 || pdf.byteLength > MAX_PREVIEW_BYTES) {
    throw new MenuThemePreviewError("menu_theme_preview_size_limit");
  }
  // PDF.js puede transferir/detachar su Uint8Array; conserva el buffer a enviar.
  const document = await getDocumentProxy(new Uint8Array(pdf), {
    isEvalSupported: false,
    useSystemFonts: false,
  });
  try {
    if (document.numPages < 1 || document.numPages > maxPages) {
      throw new MenuThemePreviewError("menu_theme_preview_page_limit");
    }
    const text: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      try {
        const content = await page.getTextContent();
        const viewport = page.getViewport({ scale: 1 });
        if (expectedPageSize && (Math.abs(viewport.width * 25.4 / 72 - expectedPageSize.widthMm) > 0.5 ||
            Math.abs(viewport.height * 25.4 / 72 - expectedPageSize.heightMm) > 0.5)) {
          throw new MenuThemePreviewError("menu_theme_preview_page_size_mismatch");
        }
        for (const item of content.items) {
          if (!("str" in item) || !item.str.trim()) continue;
          // Detecta texto que existe en el PDF pero sale de la hoja. La
          // búsqueda de palabras por sí sola no detecta precios recortados.
          const [a, b, , , x, y] = item.transform as number[];
          const length = Math.hypot(a!, b!);
          if (!length) continue;
          const ux = a! / length, uy = b! / length;
          const corners = [
            [x!, y!], [x! + ux * item.width, y! + uy * item.width],
            [x! - uy * item.height * 0.8, y! + ux * item.height * 0.8],
            [x! + ux * item.width - uy * item.height * 0.8, y! + uy * item.width + ux * item.height * 0.8],
          ].map(([px, py]) => viewport.convertToViewportPoint(px!, py!));
          const tolerance = 2; // redondeo y pequeñas diferencias de métricas.
          if (corners.some(([px, py]) => px < -tolerance || py < -tolerance || px > viewport.width + tolerance || py > viewport.height + tolerance)) {
            throw new MenuThemePreviewError("menu_theme_preview_text_outside_page");
          }
        }
        text.push(content.items.map((item) => "str" in item ? item.str : "").join(" "));
      } finally {
        page.cleanup();
      }
    }
    const printed = normalizedText(text.join(" "));
    if (requiredText.some((value) => !printed.includes(normalizedText(value)))) {
      throw new MenuThemePreviewError("menu_theme_preview_content_missing");
    }
    return pdf;
  } finally {
    await document.destroy();
  }
}
