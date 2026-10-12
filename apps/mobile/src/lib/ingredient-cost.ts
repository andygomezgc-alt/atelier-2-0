// Per-ingredient cost lines in the recipe detail (costes por ingrediente, A2).
//
// The API sends one cost line per recipe ingredient with a status. These pure
// helpers decide what the app shows for each status, where a tap leads, which
// product fields the fix sheet asks for, and the PATCH body it sends. The unit
// families mirror the cost engine (apps/api/lib/products/cost.ts).

import {
  resolvePezzaturaMode,
  type CostLineStatus,
  type PatchProductRequest,
  type PezzaturaMode,
  type ProductListItem,
  type ProductUnit,
  type RecipeCostLine,
} from "@atelier/shared";
import type { TranslationKey } from "@atelier/i18n";
import { parseEurosToCents } from "@/src/lib/money";

type UnitFamily = "weight" | "volume" | "piece" | "box";

function unitFamily(unit: string | null): UnitFamily | null {
  if (unit === "kg" || unit === "g") return "weight";
  if (unit === "l" || unit === "ml") return "volume";
  if (unit === "piezas" || unit === "unidad") return "piece";
  if (unit === "caja") return "box";
  return null;
}

const UNIT_LABEL_KEYS: Record<string, TranslationKey> = {
  kg: "unit_kg",
  g: "unit_g",
  l: "unit_l",
  ml: "unit_ml",
  unidad: "unit_unidad",
  piezas: "unit_unidad",
  caja: "unit_caja",
};

// App name of a recipe or purchase unit; null for a unit the app does not know.
export function unitLabelKey(unit: string): TranslationKey | null {
  return UNIT_LABEL_KEYS[unit] ?? null;
}

type ReasonKey = Extract<TranslationKey, `cost_line_${string}`>;

export type LineReason = {
  key: ReasonKey;
  vars?: { recipeUnit: string; purchaseUnit: string };
};

// Short reason shown under an ingredient without cost. `unitName` turns a raw
// unit into its display name.
export function lineReason(
  line: Pick<RecipeCostLine, "status" | "recipeUnit" | "purchaseUnit">,
  unitName: (unit: string) => string,
): LineReason | null {
  if (line.status === "ok") return null;
  if (line.status === "incompatible_unit") {
    return {
      key: "cost_line_incompatible_unit",
      vars: {
        recipeUnit: unitName(line.recipeUnit ?? ""),
        purchaseUnit: unitName(line.purchaseUnit ?? ""),
      },
    };
  }
  return { key: `cost_line_${line.status}` };
}

export type LineAction = "edit_recipe" | "product_detail" | "fix_sheet";

// Where a tap on an ingredient without cost leads.
export function lineAction(status: CostLineStatus): LineAction | null {
  switch (status) {
    case "ok":
      return null;
    case "no_product":
    case "no_quantity":
      return "edit_recipe";
    case "invalid_merma":
      return "product_detail";
    case "no_price":
    case "needs_density":
    case "needs_piece_weight":
    case "incompatible_unit":
      return "fix_sheet";
  }
}

export type LinePermissions = { canManageProducts: boolean; canEditRecipe: boolean };

// A row is pressable only when its fix is something this user may do. The
// recipe editor also needs recipe edit rights; the product fixes need a
// linked product. `productId` is undefined when the caller does not check it.
export function isLinePressable(
  status: CostLineStatus,
  permissions: LinePermissions,
  productId?: string | null,
): boolean {
  const action = lineAction(status);
  if (action === null || !permissions.canManageProducts) return false;
  if (action === "edit_recipe") return permissions.canEditRecipe;
  return productId !== null;
}

export type UnitPairNeed = "none" | "density" | "piece_weight" | "incompatible";

// What converting the recipe unit to the purchase unit needs.
export function unitPairNeed(recipeUnit: string | null, purchaseUnit: string): UnitPairNeed {
  const from = unitFamily(recipeUnit);
  const to = unitFamily(purchaseUnit);
  if (from === null || to === null) return "incompatible";
  if (from === to) return "none";
  const pair = new Set([from, to]);
  if (pair.has("weight") && pair.has("volume")) return "density";
  if (pair.has("weight") && pair.has("piece")) return "piece_weight";
  return "incompatible";
}

export type FixFields = {
  density: boolean;
  pieceWeight: boolean;
  // The pair needs a piece weight, but the product category has no piece
  // size the API can store (resolvePezzaturaMode is null).
  pieceWeightUnsupported: boolean;
  incompatible: boolean;
};

// Which fields the fix sheet shows for a recipe unit and the chosen purchase unit.
export function fixFields(
  recipeUnit: string | null,
  purchaseUnit: ProductUnit,
  product: Pick<ProductListItem, "name" | "category">,
): FixFields {
  const need = unitPairNeed(recipeUnit, purchaseUnit);
  const pieceMode = need === "piece_weight" ? resolvePezzaturaMode(product.name, product.category) : null;
  return {
    density: need === "density",
    pieceWeight: need === "piece_weight" && pieceMode !== null,
    pieceWeightUnsupported: need === "piece_weight" && pieceMode === null,
    incompatible: need === "incompatible",
  };
}

const OIL_GRAMS_PER_LITRE = 920;
const DEFAULT_GRAMS_PER_LITRE = 1000;
const OIL_NAME = /\b(aceite|olio|oil)/i;

// Suggested weight of 1 litre: oils are lighter than water.
export function suggestGramsPerLitre(productName: string): number {
  return OIL_NAME.test(productName) ? OIL_GRAMS_PER_LITRE : DEFAULT_GRAMS_PER_LITRE;
}

// Value the sheet starts with: the stored one, or a suggestion the chef sees
// and confirms (it is only saved on Save).
export function initialGramsPerLitre(product: {
  name: string;
  gramosPorLitro?: number | null;
}): { value: number; suggested: boolean } {
  if (product.gramosPorLitro != null && product.gramosPorLitro > 0) {
    return { value: product.gramosPorLitro, suggested: false };
  }
  return { value: suggestGramsPerLitre(product.name), suggested: true };
}

// Same bound as the API (Decimal(7,2) in the database).
const MAX_GRAMS = 99999.99;

// Positive weight in grams typed by the chef, rounded to 2 decimals. Null
// when empty or invalid.
export function parseGrams(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const n = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n * 100) / 100;
  if (rounded <= 0 || rounded > MAX_GRAMS) return null;
  return rounded;
}

export function formatGrams(grams: number): string {
  return String(Math.round(grams * 100) / 100).replace(".", ",");
}

// Piece weight as the free-text pezzatura the API parses. Shellfish is sized
// in pieces per kilo, so the weight is stored as its inverse.
export function pieceWeightInput(grams: number, mode: PezzaturaMode): string {
  if (mode === "pz_per_kg") {
    const perKg = Math.round((1000 / grams) * 100) / 100;
    return `${perKg}/${perKg}`;
  }
  return `${grams} g/pz`;
}

// Current weight of one piece from the product size, as the cost engine reads it.
export function currentPieceWeightG(
  product: Pick<ProductListItem, "pezzaturaMode" | "pezzaturaMin" | "pezzaturaMax">,
): number | null {
  const { pezzaturaMode: mode, pezzaturaMin: min, pezzaturaMax: max } = product;
  if (!mode || min === null || max === null) return null;
  const mid = (min + max) / 2;
  if (mid <= 0) return null;
  const grams = mode === "pz_per_kg" ? 1000 / mid : mid;
  return Math.round(grams * 100) / 100;
}

export type FixProduct = Pick<
  ProductListItem,
  | "name"
  | "category"
  | "unidadCompra"
  | "precioCompra"
  | "gramosPorLitro"
  | "pezzaturaMode"
  | "pezzaturaMin"
  | "pezzaturaMax"
>;

export type FixForm = {
  unit: ProductUnit;
  price: string; // euros per `unit`
  gramsPerLitre: string;
  pieceWeight: string;
};

export type FixPatchResult =
  | { ok: true; patch: PatchProductRequest }
  | { ok: false; error: "price" | "density" | "piece_weight" };

// PATCH body for the fix sheet: only the fields that changed. Fields the
// chosen unit pair does not need are ignored.
export function buildFixPatch(
  product: FixProduct,
  recipeUnit: string | null,
  form: FixForm,
): FixPatchResult {
  const patch: PatchProductRequest = {};
  if (form.unit !== product.unidadCompra) patch.unidadCompra = form.unit;

  const cents = parseEurosToCents(form.price);
  if (cents === null || cents <= 0) return { ok: false, error: "price" };
  if (cents !== product.precioCompra) patch.precioCompra = cents;

  const fields = fixFields(recipeUnit, form.unit, product);
  if (fields.density) {
    const grams = parseGrams(form.gramsPerLitre);
    if (grams === null) return { ok: false, error: "density" };
    if (grams !== (product.gramosPorLitro ?? null)) patch.gramosPorLitro = grams;
  }
  if (fields.pieceWeight) {
    const grams = parseGrams(form.pieceWeight);
    if (grams === null) return { ok: false, error: "piece_weight" };
    const mode = resolvePezzaturaMode(product.name, product.category);
    if (mode !== null && grams !== currentPieceWeightG(product)) {
      patch.pezzaturaInput = pieceWeightInput(grams, mode);
    }
  }
  return { ok: true, patch };
}

export type IngredientCostRow<I> = {
  line: RecipeCostLine;
  ingredient: I | null;
  text: string;
};

// Joins each cost line to its recipe ingredient by id, falling back to the
// position. Null when there are no lines (older API): show the legacy list.
export function joinCostLines<I extends { id: string; position: number; rawText: string }>(
  lines: readonly RecipeCostLine[] | undefined,
  ingredients: readonly I[],
  fallbackTexts: readonly string[] = [],
): IngredientCostRow<I>[] | null {
  if (!lines || lines.length === 0) return null;
  const byId = new Map(ingredients.map((i) => [i.id, i]));
  const byPosition = new Map(ingredients.map((i) => [i.position, i]));
  return lines.map((line) => {
    const ingredient = byId.get(line.ingredientId) ?? byPosition.get(line.position) ?? null;
    return { line, ingredient, text: ingredient?.rawText ?? fallbackTexts[line.position] ?? "" };
  });
}
