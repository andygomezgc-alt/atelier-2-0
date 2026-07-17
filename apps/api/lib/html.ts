// Escape de HTML compartido por las rutas de PDF (ficha receta, recetario,
// banco de productos). Antes vivía copiado idéntico en cada route.ts.

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
