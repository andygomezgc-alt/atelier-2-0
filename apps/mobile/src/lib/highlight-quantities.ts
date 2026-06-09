// C-05 — Resalta cantidades y temperaturas dentro del cuerpo del bubble del
// asistente, como en el mockup ("70°C / 11h 30m" en terracota bold).
// Whitelist explícita de unidades para evitar falsos positivos (ej. "8 grandes"
// donde "g" no es gramos). Cobertura mínima: gramos, kg, ml, l, °C, °,
// minutos/horas/segundos en notaciones comunes, número de porciones.

// La regex busca: un número (con coma o punto decimal opcional), espacio
// opcional, y una unidad de la whitelist. Las unidades h/m/s pueden venir
// pegadas al número ("11h", "30m", "45s") sin espacio.
const QTY_RE =
  /(\d+(?:[.,]\d+)?\s*(?:°C|°|kg|g|ml|l|min|seg|h|m|s|porciones|porzioni|portions|pcs|pz|unid)\b)/gi;

export type QtyToken =
  | { type: "text"; text: string }
  | { type: "qty"; text: string };

export function highlightQuantities(input: string): QtyToken[] {
  const tokens: QtyToken[] = [];
  if (!input) return tokens;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  // Defensivo: reset lastIndex por la `g` flag.
  QTY_RE.lastIndex = 0;
  while ((m = QTY_RE.exec(input)) !== null) {
    if (m.index > lastIndex) {
      tokens.push({ type: "text", text: input.slice(lastIndex, m.index) });
    }
    tokens.push({ type: "qty", text: m[0] });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < input.length) {
    tokens.push({ type: "text", text: input.slice(lastIndex) });
  }
  return tokens;
}
