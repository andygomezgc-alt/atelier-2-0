// "Tu estilo" — helpers puros (sin React) para la mini-carta del
// StylePreviewSheet. Réplica de la matemática de contraste de
// apps/api/lib/pdf/templates.ts (themeFromSpec) para que la preview nativa
// se vea consistente con el PDF real.

/**
 * El spec acota titleSizePt a [22, 34] (puntos, pensados para el PDF). La
 * mini-carta vive en px de pantalla — 0.8 aproxima el pt→px del sheet sin
 * que el título domine el card (22pt→18px, 34pt→27px).
 */
export function titlePxFromPt(pt: number): number {
  return Math.round(pt * 0.8);
}

// Luminancia relativa WCAG (sRGB → lineal). Idéntica a templates.ts.
function relativeLuminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const chan = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return (
    0.2126 * chan((n >> 16) & 0xff) +
    0.7152 * chan((n >> 8) & 0xff) +
    0.0722 * chan(n & 0xff)
  );
}

function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// Mismo guard que el PDF: si el ratio bg↔color queda por debajo de ~2.5,
// forzamos una tinta neutra de la casa según la luminancia del fondo.
export function legibleOn(bg: string, color: string): string {
  if (contrastRatio(bg, color) >= 2.5) return color;
  return relativeLuminance(bg) > 0.5 ? "#2a2520" : "#f9f7f2";
}
