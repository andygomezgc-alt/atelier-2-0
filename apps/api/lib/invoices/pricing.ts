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
  cf: "caja", conf: "caja", confezione: "caja", confezioni: "caja",
};

export function normalizeInvoiceUnit(raw: string | null): ProductUnit | null {
  if (!raw) return null;
  return UNIT_ALIASES[raw.trim().toLowerCase().replace(/\.$/, "")] ?? null;
}

// Last price PAID. A line discount ("Sc. 15%") prints a total below quantity × list price, so
// total / quantity wins. A total ABOVE it means the quantity was misread: the printed price stands.
function pricePaidPerUnit(input: { unitPriceCents: number | null; quantity: number | null; lineTotalCents: number | null }): number | null {
  const fromTotal =
    input.quantity !== null && input.quantity > 0 && input.lineTotalCents !== null && input.lineTotalCents > 0
      ? input.lineTotalCents / input.quantity
      : null;
  if (input.unitPriceCents === null) return fromTotal;
  if (fromTotal === null || fromTotal >= input.unitPriceCents - 1) return input.unitPriceCents;
  return fromTotal;
}

// The review screen asks the chef to check the quantity when the total cannot come from it.
export function quantityLooksMisread(line: { quantity: number | null; unitPriceCents: number | null; lineTotalCents: number | null }): boolean {
  if (line.quantity === null || line.unitPriceCents === null || line.lineTotalCents === null || line.quantity <= 0) return false;
  const expected = line.quantity * line.unitPriceCents;
  return line.lineTotalCents - expected > Math.max(2, expected * 0.01);
}

// Pack content printed in the description ("pz24", "1100 X 4", "kg 1,75", "Kili: 4"): if it was not read
// into packQty, a package price must not be taken as a unit price.
const PACK_HINT = /\b(?:pz|pezzi|pcs)\s*\d|\d\s*[x×]\s*\d|\b(?:kg|kili|g|gr|l|lt)\s*:?\s*\d/i;
const MAX_ROUNDING_ERROR = 0.05;

export function priceInBankUnit(
  input: {
    unitPriceCents: number | null;
    unit: string | null;
    packQty: number | null;
    packUnit: string | null;
    quantity: number | null;
    lineTotalCents: number | null;
    description?: string;
  },
  bankUnit: ProductUnit,
): number | null {
  // Returns, deposits and credit lines are never a purchase price.
  if ((input.quantity !== null && input.quantity < 0) || (input.lineTotalCents !== null && input.lineTotalCents < 0)) {
    return null;
  }
  const paidCents = pricePaidPerUnit(input);
  if (paidCents === null || !(paidCents > 0)) return null;
  const unit = normalizeInvoiceUnit(input.unit);
  if (unit === null) return null;

  let priceCents = paidCents;
  let perUnit: ProductUnit = unit;
  const packUnit = normalizeInvoiceUnit(input.packUnit);
  const hasPack = input.packQty !== null && input.packQty > 0 && packUnit !== null;
  // A bank that buys by the case keeps the case price; a bank that buys by the piece divides
  // only by a content counted in pieces (a box of 24), never by a weight.
  const keepsPackage = unit === bankUnit && (unit === "caja" || packUnit !== bankUnit);
  if ((unit === "caja" || unit === "unidad") && !(unit === "caja" && bankUnit === "caja")) {
    if (hasPack && !keepsPackage) {
      priceCents = paidCents / input.packQty!;
      perUnit = packUnit!;
    } else if (!hasPack && PACK_HINT.test(input.description ?? "")) {
      return null;
    }
  }
  // How many `perUnit` fit in one bank unit (1 kg = 1000 g). Null when the
  // conversion needs a density or a pack content we do not have.
  const perUnitsInBankUnit = perUnit === bankUnit ? 1 : convertUnit(1, bankUnit, perUnit);
  if (perUnitsInBankUnit === null) return null;
  const exact = priceCents * perUnitsInBankUnit;
  const rounded = Math.round(exact);
  // Cents per gram or millilitre can lose most of the price in rounding (1.25 → 1): the chef enters it.
  if (rounded <= 0 || Math.abs(rounded - exact) / exact > MAX_ROUNDING_ERROR) return null;
  return rounded;
}

// The unit a new draft product gets: the pack content's unit when the line sells packages.
export function draftUnitFor(line: { unit: string | null; packQty: number | null; packUnit: string | null }): ProductUnit | null {
  const unit = normalizeInvoiceUnit(line.unit);
  const packUnit = normalizeInvoiceUnit(line.packUnit);
  if ((unit === "caja" || unit === "unidad") && line.packQty !== null && line.packQty > 0 && packUnit !== null) return packUnit;
  return unit;
}

export type LineProposal =
  | { action: "create_draft"; priceCents: number | null; preselected: true }
  | { action: "update_price"; priceCents: number; changePct: number | null; preselected: boolean }
  | { action: "connect"; priceCents: null; reason: "unsafe_conversion" | "older_invoice" | "same_price" }
  | { action: "ignore"; priceCents: null; reason: "charge" };

export function proposeLine(input: {
  productId: string | null;
  currentPriceCents: number;
  currentPriceAt: Date | null;
  newPriceCents: number | null;
  invoiceDate: string;
  kind?: "item" | "charge";
}): LineProposal {
  if (input.kind === "charge") return { action: "ignore", priceCents: null, reason: "charge" };
  if (input.productId === null) return { action: "create_draft", priceCents: input.newPriceCents, preselected: true };
  if (input.newPriceCents === null) return { action: "connect", priceCents: null, reason: "unsafe_conversion" };
  // No price yet: any paid price beats none. precioActualizadoAt is then just
  // the creation date (drafts from recipe imports), not a paid price's date.
  if (input.currentPriceCents <= 0) {
    return { action: "update_price", priceCents: input.newPriceCents, changePct: null, preselected: true };
  }
  // Compare calendar days: the invoice has a date, the price a timestamp.
  if (input.currentPriceAt && input.invoiceDate < input.currentPriceAt.toISOString().slice(0, 10)) {
    return { action: "connect", priceCents: null, reason: "older_invoice" };
  }
  if (input.newPriceCents === input.currentPriceCents) return { action: "connect", priceCents: null, reason: "same_price" };
  // Pre-selection compares the unrounded change: 19.6% shows as 20 but is still under the threshold.
  const exactPct = ((input.newPriceCents - input.currentPriceCents) / input.currentPriceCents) * 100;
  return { action: "update_price", priceCents: input.newPriceCents, changePct: Math.round(exactPct), preselected: Math.abs(exactPct) < BIG_CHANGE_PCT };
}
