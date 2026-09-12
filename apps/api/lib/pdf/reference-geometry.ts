// Medidas del PDF, obtenidas sin OCR ni llamadas a modelos.
export type PdfReferenceGeometry = { pages: { widthMm: number; heightMm: number }[] };
type PdfDocument = {
  numPages: number;
  getPage: (number: number) => Promise<{
    getViewport: (options: { scale: number }) => { width: number; height: number };
    cleanup: () => unknown;
  }>;
};

export async function readReferenceGeometry(document: PdfDocument): Promise<PdfReferenceGeometry> {
  const pages: PdfReferenceGeometry["pages"] = [];
  for (let number = 1; number <= document.numPages; number++) {
    const page = await document.getPage(number);
    try {
      // El viewport incluye rotación y UserUnit del PDF.
      const viewport = page.getViewport({ scale: 1 });
      const widthMm = Math.round(viewport.width * 25.4 / 72 * 10) / 10;
      const heightMm = Math.round(viewport.height * 25.4 / 72 * 10) / 10;
      if (![widthMm, heightMm].every(n => Number.isFinite(n) && n >= 10 && n <= 2000)) {
        throw new Error("menu_reference_page_size_invalid");
      }
      pages.push({ widthMm, heightMm });
    } finally { page.cleanup(); }
  }
  return { pages };
}

export function referenceGeometryPrompt(reference?: PdfReferenceGeometry): string {
  if (!reference?.pages.length) return "";
  const sizes = reference.pages.map((page, i) => `${i + 1}: ${page.widthMm} × ${page.heightMm} mm`).join("; ");
  return `Medidas verificadas del PDF original (ancho × alto): ${sizes}. Conservá estas proporciones y la orientación; no supongas A4. Revisá cómo continúa el diseño en las páginas interiores. La cantidad de páginas de salida puede variar con los platos nuevos; no los reduzcas ni ocultes para igualar la cantidad del original.`;
}

export function uniformReferenceSize(reference?: PdfReferenceGeometry): PdfReferenceGeometry["pages"][number] | undefined {
  if (!reference?.pages.length) return undefined;
  const first = reference.pages[0]!;
  const sameSize = reference.pages.every(page => Math.abs(page.widthMm - first.widthMm) <= 0.2 && Math.abs(page.heightMm - first.heightMm) <= 0.2);
  return sameSize ? first : undefined;
}

export function preserveReferencePageSize(css: string, reference?: PdfReferenceGeometry): string {
  const first = uniformReferenceSize(reference);
  if (!first) return css; // Los formatos mixtos necesitan el layout del modelo.
  // Última regla solo de tamaño: conserva los márgenes y demás reglas del tema.
  return `${css}\n@page { size: ${first.widthMm}mm ${first.heightMm}mm; }`;
}
