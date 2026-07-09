// Formato monetario ÚNICO para mostrar precios (auditoría jul 2026: antes se
// mezclaba punto/coma decimal y la posición del símbolo entre pantallas).
// Estándar EU/italiano: coma decimal, símbolo € después con espacio.
// 320 (centavos) -> "3,20 €".
//
// Nota: esto es solo para DISPLAY. Los inputs editables guardan el número sin
// símbolo (ver parseEurosToCents en las pantallas de producto).

export function formatEuros(cents: number): string {
  return `${(cents / 100).toFixed(2).replace(".", ",")} €`;
}

// Precio por unidad de compra: "3,20 €/kg".
export function formatEurosPerUnit(cents: number, unitShort: string): string {
  return `${(cents / 100).toFixed(2).replace(".", ",")} €/${unitShort}`;
}
