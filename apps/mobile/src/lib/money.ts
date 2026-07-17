// Formato monetario ÚNICO para mostrar precios (auditoría jul 2026: antes se
// mezclaba punto/coma decimal y la posición del símbolo entre pantallas).
// Estándar EU/italiano: coma decimal, símbolo € después con espacio.
// 320 (centavos) -> "3,20 €".
//
// Nota: esto es solo para DISPLAY. Los inputs editables guardan el número sin
// símbolo (ver parseEurosToCents más abajo).

export function formatEuros(cents: number): string {
  return `${(cents / 100).toFixed(2).replace(".", ",")} €`;
}

// Precio por unidad de compra: "3,20 €/kg".
export function formatEurosPerUnit(cents: number, unitShort: string): string {
  return `${(cents / 100).toFixed(2).replace(".", ",")} €/${unitShort}`;
}

// Parsea "12,50" o "12.50" → 1250 centavos (input de precio de producto).
// null si está vacío, no es un número válido, o es negativo.
export function parseEurosToCents(input: string): number | null {
  if (!input.trim()) return null;
  const n = Number(input.replace(",", ".").trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

// Precio de plato de menú (compositor/preview): limpia todo salvo
// dígitos/coma/punto, nunca negativo. A diferencia de parseEurosToCents,
// jamás devuelve null — input vacío o basura cae a 0.
export function centsFromInput(raw: string): number {
  const cleaned = raw.replace(/[^0-9.,]/g, "").replace(",", ".");
  const n = parseFloat(cleaned || "0");
  return Math.max(0, Math.round(n * 100));
}

// Precio de plato para el input editable — sin decimales (los menús muestran
// precios enteros, ej. "28").
export function formatPrice(cents: number): string {
  return (cents / 100).toFixed(0);
}
