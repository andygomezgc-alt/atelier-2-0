// The bank's real cost, computed the way the server does it (projections.ts): the price plus
// its purchase tax, over the useful yield. Used for the optimistic update while a save travels.
export function realCostWithTax(cents: number, mermaPct: number, taxRatePct = 0): number | null {
  if (!Number.isFinite(mermaPct) || mermaPct < 0 || mermaPct >= 100) return null;
  return (cents * (1 + taxRatePct / 100)) / (1 - mermaPct / 100);
}

// "10", "10,5", "4 %" → 10, 10.5, 4. Outside 0–100 or with more than 2 decimals → null.
export function parseTaxRatePct(input: string): number | null {
  const cleaned = input.replace("%", "").trim().replace(",", ".");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return value <= 100 ? value : null;
}

// Why a suggested waste has its value (the invoice AI's reason); hidden once the chef sets it.
export function suggestedMermaReason(product: { mermaOrigen: string; mermaMotivo?: string | null }): string | null {
  return product.mermaOrigen === "sugerida" && product.mermaMotivo ? product.mermaMotivo : null;
}
