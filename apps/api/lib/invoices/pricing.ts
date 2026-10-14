// Turns one invoice line into a price in the product's bank unit and decides
// what the review screen proposes. Pure rules from the 2026-10-14 spec: last
// price paid wins, under 20% is pre-selected, an unsafe conversion proposes
// no price, and an invoice older than the current price never overwrites it.
import type { ProductUnit } from "@atelier/db";
import { convertUnit } from "../products/cost";

export const BIG_CHANGE_PCT = 20;

const UNIT_ALIASES: Record<string, ProductUnit> = {
  kg: "kg", kgs: "kg", kilo: "kg", kilos: "kg", chilo: "kg", chili: "kg",
  g: "g", gr: "g", grs: "g", grammi: "g", gramos: "g", grams: "g",
  l: "l", lt: "l", lts: "l", litro: "l", litri: "l", litros: "l", litre: "l", liter: "l",
  ml: "ml",
  pz: "unidad", pezzi: "unidad", pezzo: "unidad", un: "unidad", unid: "unidad", unidad: "unidad",
  unidades: "unidad", u: "unidad", n: "unidad", nr: "unidad", pc: "unidad", pcs: "unidad", unit: "unidad", units: "unidad",
  cassa: "caja", casse: "caja", caja: "caja", cajas: "caja", box: "caja", cartone: "caja", cartoni: "caja",
  ct: "caja", cs: "caja", collo: "caja", colli: "caja", case: "caja",
};

export function normalizeInvoiceUnit(raw: string | null): ProductUnit | null {
  if (!raw) return null;
  return UNIT_ALIASES[raw.trim().toLowerCase().replace(/\.$/, "")] ?? null;
}

export function priceInBankUnit(
  input: { unitPriceCents: number | null; unit: string | null; packQty: number | null; packUnit: string | null },
  bankUnit: ProductUnit,
): number | null {
  if (input.unitPriceCents === null || !(input.unitPriceCents > 0)) return null;
  const unit = normalizeInvoiceUnit(input.unit);
  if (unit === null) return null;
  if (unit === bankUnit) return input.unitPriceCents;

  let priceCents = input.unitPriceCents;
  let perUnit: ProductUnit = unit;
  const packUnit = normalizeInvoiceUnit(input.packUnit);
  if ((unit === "caja" || unit === "unidad") && input.packQty !== null && input.packQty > 0 && packUnit !== null) {
    priceCents = input.unitPriceCents / input.packQty;
    perUnit = packUnit;
  }
  // How many `perUnit` fit in one bank unit (1 kg = 1000 g). Null when the
  // conversion needs a density or a pack content we do not have.
  const perUnitsInBankUnit = convertUnit(1, bankUnit, perUnit);
  if (perUnitsInBankUnit === null) return null;
  return Math.round(priceCents * perUnitsInBankUnit);
}

export type LineProposal =
  | { action: "create_draft"; priceCents: number | null; preselected: true }
  | { action: "update_price"; priceCents: number; changePct: number | null; preselected: boolean }
  | { action: "connect"; priceCents: null; reason: "unsafe_conversion" | "older_invoice" | "same_price" };

export function proposeLine(input: {
  productId: string | null;
  currentPriceCents: number;
  currentPriceAt: Date | null;
  newPriceCents: number | null;
  invoiceDate: string;
}): LineProposal {
  if (input.productId === null) return { action: "create_draft", priceCents: input.newPriceCents, preselected: true };
  if (input.newPriceCents === null) return { action: "connect", priceCents: null, reason: "unsafe_conversion" };
  // Compare calendar days: the invoice has a date, the price a timestamp.
  if (input.currentPriceAt && input.invoiceDate < input.currentPriceAt.toISOString().slice(0, 10)) {
    return { action: "connect", priceCents: null, reason: "older_invoice" };
  }
  if (input.currentPriceCents <= 0) {
    return { action: "update_price", priceCents: input.newPriceCents, changePct: null, preselected: true };
  }
  if (input.newPriceCents === input.currentPriceCents) return { action: "connect", priceCents: null, reason: "same_price" };
  const changePct = Math.round(((input.newPriceCents - input.currentPriceCents) / input.currentPriceCents) * 100);
  return { action: "update_price", priceCents: input.newPriceCents, changePct, preselected: Math.abs(changePct) < BIG_CHANGE_PCT };
}
