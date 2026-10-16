// Cálculo de costo de una receta a partir de sus RecipeIngredient enlazados
// al banco de productos. Llamado desde projectRecipeDetail para exponer el
// campo `cost` en la response de GET /api/recipes/[id].
//
// ──── Decisión clave: cuándo aplica merma ────
// La merma representa el descarte al limpiar/pelar/desconchar. Solo aplica
// cuando el chef compra a peso bruto y la receta usa el peso útil. NO se
// aplica cuando el chef compra piezas enteras y la receta también cuenta
// piezas (la merma física ya está pagada al comprar la pieza completa).
//
// Casos:
//   recipe.unit \ product.unidadCompra │ kg/g (peso) │ unidad (pieza)
//   ─────────────────────────────────────┼─────────────┼────────────────
//   kg / g  (peso útil de receta)        │  CON merma  │  sin merma†
//   piezas / unidad                       │  sin merma  │  sin merma
//   ─────────────────────────────────────────────────────────────────
//   † requiere pezzatura para resolver el peso por pieza.
//
// ──── Override pesoCalculoG (Entrega A.5, Ajuste 1) ────
// `RecipeIngredient.pesoCalculoG` es el PESO BRUTO de la pieza entera, antes
// de pelar/limpiar. Si el chef quiere usar el peso post-merma para su
// cálculo, NO debe meter el peso útil acá — debe ajustar `mermaPct` del
// producto en el banco. Esta interpretación cierra ambigüedad culinaria.
//
// ──── Pezzatura ────
// Cuando hay mismatch entre unit de receta (piezas) y unidadCompra (peso),
// necesitamos saber "cuánto pesa una pieza" para resolver. Source of truth:
//   1. RecipeIngredient.pesoCalculoG (override por receta)
//   2. Producto.pezzaturaMode/Min/Max (banco): punto medio del rango
//   3. Else → ingrediente unmeasured (no entra al cost)
//
// Si el rango del banco es ancho (max/min > 2, ej. 2-8 kg), el cálculo se
// hace igual con punto medio pero se reporta un warning ("wide_range") para
// que la UI avise al chef que el costo es aproximado.
//
// ──── Weight ↔ volume (gramosPorLitro) ────
// A recipe in g/kg against a product bought in l/ml (or the reverse) is
// converted with the product's declared weight of one litre. It follows the
// weight/volume branch, so merma applies. Without that value the ingredient
// is `needs_density`: the engine never guesses a density.
//
// ──── Per-ingredient lines ────
// Every ingredient gets one line with a CostLineStatus explaining whether
// (and why not) it adds to the total. The aggregate counters keep their
// historical meaning: needs_*, incompatible_unit and invalid_merma count as
// unmeasured, like before.

import type {
  CostLineStatus,
  ProductUnit,
  PezzaturaMode,
  RecipeCostLine,
} from "@atelier/shared";

// Conserva fracciones de centavo: redondeamos solo al sumar la receta.
// Rendimiento cero o datos inválidos no tienen un precio útil calculable.
export function realCost(precioCompraCents: number, mermaPct: number): number | null {
  if (!Number.isFinite(mermaPct) || mermaPct < 0 || mermaPct >= 100) return null;
  return precioCompraCents / (1 - mermaPct / 100);
}

// Conversión entre unidades del mismo tipo (peso o volumen). Devuelve un
// factor multiplicativo k tal que: qty_en_<to> = qty_en_<from> × k.
// Conversiones piezas↔peso NO viven acá — esas requieren pezzatura y se
// resuelven en computeRecipeCost.
export function convertUnit(
  qty: number,
  from: ProductUnit,
  to: ProductUnit,
): number | null {
  if (from === to) return qty;
  if (from === "g" && to === "kg") return qty / 1000;
  if (from === "kg" && to === "g") return qty * 1000;
  if (from === "ml" && to === "l") return qty / 1000;
  if (from === "l" && to === "ml") return qty * 1000;
  return null;
}

// "piezas" y "unidad" son sinónimos en la receta — el chef escribe lo que
// le sale natural. Ambas mapean a producto.unidadCompra = "unidad".
function isPieceUnit(u: string): boolean {
  return u === "piezas" || u === "unidad";
}

// Tipos de input/output del cálculo.
export type RecipeIngredientForCost = {
  // RecipeIngredient id and position, used only to label `lines`. Callers
  // that only need totals (recalc, scripts) may omit them; lines then fall
  // back to the input index.
  id?: string;
  position?: number;
  qty: number | null;
  unit: string | null;
  mermaOverridePct: number | null;
  // Entrega A.5: peso BRUTO de la pieza entera (antes de pelar/limpiar).
  // Null = usar el punto medio del rango del banco (si hay).
  pesoCalculoG: number | null;
  product: {
    id?: string;
    precioCompra: number; // centavos
    // Purchase tax in percent (Product.taxRatePct). Absent or 0 = no tax.
    taxRatePct?: number;
    mermaPct: number;     // 0-100
    unidadCompra: ProductUnit;
    // Weight in grams of 1 litre; null/undefined = unknown (never guessed).
    gramosPorLitro?: number | null;
    // Entrega A.5: campos canónicos de pezzatura.
    pezzaturaMode: PezzaturaMode | null;
    pezzaturaMin: number | null;
    pezzaturaMax: number | null;
  } | null;
};

export type IngredientCostWarning = "wide_range";

export type RecipeCostBreakdown = {
  status: "complete" | "partial" | "unavailable";
  totalCents: number | null;        // null si no hay ningún ingrediente computable
  perPortionCents: number | null;   // null si totalCents es null
  foodCostPct: number | null;       // null si no hay salePrice O totalCents es null
  totalIngredients: number;
  computableCount: number;
  missingPriceCount: number;        // producto enlazado pero precioCompra=0
  unmeasuredCount: number;          // qty/unit null o conversión imposible
  unlinkedCount: number;            // productId=null
  // Entrega A.5: cuántos ingredientes computables tienen pezzatura con
  // rango max/min > 2 (la UI muestra "costo es aproximación").
  wideRangeCount: number;
  // Warnings por índice del ingrediente (mismo orden que input.ingredients).
  // projectRecipeDetail los aplica al recipeIngredient correspondiente.
  warningsByIdx: Map<number, IngredientCostWarning>;
  // Importes sin redondear para la criticidad económica; no se exponen en API.
  costsByIdx: Map<number, number>;
  // One line per ingredient, sorted by position.
  lines: RecipeCostLine[];
};

export type RecipeCostInput = {
  ingredients: RecipeIngredientForCost[];
  portions: number | null;
  salePriceCents: number | null;
};

// Resuelve el peso bruto por pieza. Override del chef gana sobre el banco.
function pesoPorPiezaG(ing: RecipeIngredientForCost): number | null {
  if (ing.pesoCalculoG !== null && ing.pesoCalculoG > 0) {
    return ing.pesoCalculoG;
  }
  const p = ing.product;
  if (
    !p ||
    !p.pezzaturaMode ||
    p.pezzaturaMin === null ||
    p.pezzaturaMax === null
  ) {
    return null;
  }
  const mid = (p.pezzaturaMin + p.pezzaturaMax) / 2;
  if (mid <= 0) return null;
  if (p.pezzaturaMode === "pz_per_kg") {
    // min/max en pz/kg → punto medio en pz/kg → 1000g / midPzPerKg = g/pz.
    return 1000 / mid;
  }
  // g_per_piece: min/max ya en gramos por pieza.
  return mid;
}

function hasWideRange(p: {
  pezzaturaMin: number | null;
  pezzaturaMax: number | null;
}): boolean {
  if (
    p.pezzaturaMin === null ||
    p.pezzaturaMax === null ||
    p.pezzaturaMin <= 0
  )
    return false;
  return p.pezzaturaMax / p.pezzaturaMin > 2;
}

// Unit families. "piezas"/"unidad" in the recipe and "unidad" in the product
// are pieces; "caja" only matches "caja". Null = a unit the engine does not
// know (e.g. "cucharada").
type UnitKind = "weight" | "volume" | "piece" | "box";

function unitKind(u: string): UnitKind | null {
  if (u === "kg" || u === "g") return "weight";
  if (u === "l" || u === "ml") return "volume";
  if (isPieceUnit(u)) return "piece";
  if (u === "caja") return "box";
  return null;
}

// Weight ↔ volume with the product's weight of one litre. Returns the
// quantity expressed in `to`, or null when the pair is not weight ↔ volume.
function convertWithDensity(
  qty: number,
  from: ProductUnit,
  to: ProductUnit,
  gramosPorLitro: number,
): number | null {
  const grams = convertUnit(qty, from, "g");
  if (grams !== null) return convertUnit(grams / gramosPorLitro, "l", to);
  const litres = convertUnit(qty, from, "l");
  if (litres !== null) return convertUnit(litres * gramosPorLitro, "g", to);
  return null;
}

type LinkedProduct = NonNullable<RecipeIngredientForCost["product"]>;
type IngredientPricing =
  | { cost: number; warning: IngredientCostWarning | null }
  | { status: Exclude<CostLineStatus, "ok" | "no_product" | "no_price"> };

// precioCompra is net; recipe cost shows it with the product's purchase tax
// (spec 2026-10-14). Applied to the price itself so every unit path and the
// waste correction see the taxed price.
function withTax(product: LinkedProduct): LinkedProduct {
  const rate = product.taxRatePct ?? 0;
  if (!(rate > 0)) return product;
  return { ...product, precioCompra: product.precioCompra * (1 + rate / 100) };
}

// Prices one linked ingredient that has a price, a quantity and a unit, in
// unrounded cents — or says why it cannot be priced.
function priceIngredient(
  ing: RecipeIngredientForCost,
  product: LinkedProduct,
  qty: number,
  unit: string,
): IngredientPricing {
  const from = unitKind(unit);
  if (from === null) return { status: "no_quantity" };
  const to = unitKind(product.unidadCompra);
  if (to === null) return { status: "incompatible_unit" };

  if (from === "piece" && to === "piece") {
    // Caso trivial: chef compra unidades, receta cuenta unidades.
    // Sin merma (la pieza entera ya está pagada).
    return { cost: qty * product.precioCompra, warning: null };
  }

  if (from === "piece" || to === "piece") {
    // Piezas ↔ peso necesita el peso por pieza. Sin merma — el chef compra
    // piezas enteras y "paga" la merma cuando las desconcha/limpia.
    // Piezas ↔ volumen o caja no tiene conversión.
    if ((from === "piece" ? to : from) !== "weight") return { status: "incompatible_unit" };
    const peso = pesoPorPiezaG(ing);
    if (peso === null) return { status: "needs_piece_weight" };
    // Si no hay override y el rango del banco es ancho, warning.
    const warning = ing.pesoCalculoG === null && hasWideRange(product) ? "wide_range" : null;
    if (from === "piece") {
      // Receta cuenta piezas, producto se compra por peso (kg/g).
      // Precio está en €/unidadCompra. Si compra=kg, convertir gramos a kg.
      const totalG = qty * peso;
      const factor = product.unidadCompra === "kg" ? 1 / 1000 : 1;
      return { cost: totalG * factor * product.precioCompra, warning };
    }
    // Receta usa peso (kg/g), producto se compra por unidad: cuántas piezas
    // representa el peso.
    const qtyEnG = unit === "kg" ? qty * 1000 : qty;
    return { cost: (qtyEnG / peso) * product.precioCompra, warning };
  }

  if ((from === "box" || to === "box") && from !== to) {
    return { status: "incompatible_unit" };
  }

  // Peso, volumen o caja en ambos lados — conversión a la unidad de compra
  // (con gramosPorLitro cuando se cruzan peso y volumen) y merma (chef compra
  // peso bruto, receta usa peso útil).
  let qtyInPurchaseUnit: number | null;
  if (from === to) {
    qtyInPurchaseUnit = convertUnit(qty, unit as ProductUnit, product.unidadCompra);
  } else {
    const gramosPorLitro = product.gramosPorLitro;
    if (gramosPorLitro == null || !(gramosPorLitro > 0)) return { status: "needs_density" };
    qtyInPurchaseUnit = convertWithDensity(qty, unit as ProductUnit, product.unidadCompra, gramosPorLitro);
  }
  if (qtyInPurchaseUnit === null) return { status: "incompatible_unit" };

  const merma = ing.mermaOverridePct !== null ? ing.mermaOverridePct : product.mermaPct;
  const realPerPurchaseUnit = realCost(product.precioCompra, merma);
  if (realPerPurchaseUnit === null) return { status: "invalid_merma" };
  return { cost: realPerPurchaseUnit * qtyInPurchaseUnit, warning: null };
}

export function computeRecipeCost(input: RecipeCostInput): RecipeCostBreakdown {
  let computableTotalCents = 0;
  let computableCount = 0;
  let missingPriceCount = 0;
  let unmeasuredCount = 0;
  let unlinkedCount = 0;
  let wideRangeCount = 0;
  const warningsByIdx = new Map<number, IngredientCostWarning>();
  const costsByIdx = new Map<number, number>();
  const lines: RecipeCostLine[] = [];
  const totalIngredients = input.ingredients.length;

  for (let idx = 0; idx < input.ingredients.length; idx++) {
    const ing = input.ingredients[idx]!;
    const product = ing.product;
    let status: CostLineStatus;
    let ingCost: number | null = null;

    if (!product) {
      unlinkedCount++;
      status = "no_product";
    } else if (product.precioCompra <= 0) {
      missingPriceCount++;
      status = "no_price";
    } else if (ing.qty === null || ing.qty <= 0 || !ing.unit) {
      unmeasuredCount++;
      status = "no_quantity";
    } else {
      const pricing = priceIngredient(ing, withTax(product), ing.qty, ing.unit);
      if ("status" in pricing) {
        // Unknown units, needs_*, incompatible_unit and invalid_merma all
        // count as unmeasured, as they did before per-ingredient lines.
        unmeasuredCount++;
        status = pricing.status;
      } else {
        status = "ok";
        ingCost = pricing.cost;
        computableTotalCents += ingCost;
        costsByIdx.set(idx, ingCost);
        computableCount++;
        if (pricing.warning) {
          warningsByIdx.set(idx, pricing.warning);
          wideRangeCount++;
        }
      }
    }

    lines.push({
      ingredientId: ing.id ?? String(idx),
      position: ing.position ?? idx,
      status,
      // Rounded for display only; totalCents sums the unrounded costs.
      costCents: ingCost === null ? null : Math.round(ingCost),
      productId: product?.id ?? null,
      recipeUnit: ing.unit,
      purchaseUnit: product?.unidadCompra ?? null,
    });
  }
  // Stable sort: ingredients sharing a position keep their input order.
  lines.sort((a, b) => a.position - b.position);

  const totalCents =
    computableCount > 0 ? Math.round(computableTotalCents) : null;
  const status = computableCount === 0 ? "unavailable" : computableCount < totalIngredients ? "partial" : "complete";
  const portions = input.portions && input.portions > 0 ? input.portions : null;
  const perPortionCents =
    totalCents !== null && portions !== null ? Math.round(totalCents / portions) : null;
  // Food cost POR RACIÓN (decisión de producto): `salePriceCents` es el PVP de
  // UNA porción, como en cualquier restaurante. El % compara el coste POR RACIÓN
  // contra ese PVP, no el coste de la tanda entera (que inflaba el % ×porciones).
  // Base sobre totalCents/(portions*salePriceCents) y NO perPortionCents/salePrice
  // para no arrastrar el redondeo a centavo de perPortionCents.
  // Ej.: receta 4 porciones, coste total 20€ (2000c), PVP ración 10€ (1000c)
  //      → 2000/(4*1000) = 0,5 → 50%.
  const foodCostPct =
    status === "complete" && totalCents !== null && portions !== null && input.salePriceCents && input.salePriceCents > 0
      ? Math.round((totalCents / (portions * input.salePriceCents)) * 100)
      : null;

  return {
    status,
    totalCents,
    perPortionCents,
    foodCostPct,
    totalIngredients,
    computableCount,
    missingPriceCount,
    unmeasuredCount,
    unlinkedCount,
    wideRangeCount,
    warningsByIdx,
    costsByIdx,
    lines,
  };
}
