// Change of a product's last price against the one before it, for the trend
// shown in the product list. History rows come newest first.
import type { ProductUnit } from "@atelier/shared";

type PricePoint = { precio: number; unidadCompra: ProductUnit };

// Whole percent, or null when there is nothing honest to compare: no previous
// price, a previous price of zero, a unit change, a newest row that no longer
// matches the product's current price, or a change that rounds to zero.
export function lastPriceChangePct(
  history: PricePoint[],
  current: { precioCompra: number; unidadCompra: ProductUnit },
): number | null {
  const [latest, previous] = history;
  if (!latest || !previous) return null;
  if (latest.precio !== current.precioCompra || latest.unidadCompra !== current.unidadCompra) return null;
  if (previous.unidadCompra !== latest.unidadCompra || previous.precio <= 0) return null;
  const pct = Math.round(((latest.precio - previous.precio) / previous.precio) * 100);
  return pct === 0 ? null : pct;
}
