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

import type { ProductUnit, PezzaturaMode } from "@atelier/shared";

// `realCost` redondea hacia arriba en centavos enteros (igual que projections.ts).
// Si mermaPct >= 100 (caso defensivo) no aplica merma — el precio crudo es el real.
export function realCost(precioCompraCents: number, mermaPct: number): number {
  if (mermaPct >= 100) return precioCompraCents;
  return Math.ceil(precioCompraCents / (1 - mermaPct / 100));
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
  qty: number | null;
  unit: string | null;
  mermaOverridePct: number | null;
  // Entrega A.5: peso BRUTO de la pieza entera (antes de pelar/limpiar).
  // Null = usar el punto medio del rango del banco (si hay).
  pesoCalculoG: number | null;
  product: {
    precioCompra: number; // centavos
    mermaPct: number;     // 0-100
    unidadCompra: ProductUnit;
    // Entrega A.5: campos canónicos de pezzatura.
    pezzaturaMode: PezzaturaMode | null;
    pezzaturaMin: number | null;
    pezzaturaMax: number | null;
  } | null;
};

export type IngredientCostWarning = "wide_range";

export type RecipeCostBreakdown = {
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

export function computeRecipeCost(input: RecipeCostInput): RecipeCostBreakdown {
  let computableTotalCents = 0;
  let computableCount = 0;
  let missingPriceCount = 0;
  let unmeasuredCount = 0;
  let unlinkedCount = 0;
  let wideRangeCount = 0;
  const warningsByIdx = new Map<number, IngredientCostWarning>();
  const totalIngredients = input.ingredients.length;

  const KNOWN: ReadonlySet<ProductUnit> = new Set([
    "kg",
    "g",
    "l",
    "ml",
    "unidad",
    "caja",
  ]);

  for (let idx = 0; idx < input.ingredients.length; idx++) {
    const ing = input.ingredients[idx]!;

    if (!ing.product) {
      unlinkedCount++;
      continue;
    }
    if (ing.product.precioCompra <= 0) {
      missingPriceCount++;
      continue;
    }
    if (ing.qty === null || ing.qty <= 0 || !ing.unit) {
      unmeasuredCount++;
      continue;
    }

    const recipeUnitRaw = ing.unit;
    const isRecipePiece = isPieceUnit(recipeUnitRaw);
    const isCompraPiece = ing.product.unidadCompra === "unidad";

    let ingCost: number | null = null;
    let warning: IngredientCostWarning | null = null;

    if (isRecipePiece && isCompraPiece) {
      // Caso trivial: chef compra unidades, receta cuenta unidades.
      // Sin merma (la pieza entera ya está pagada).
      ingCost = ing.qty * ing.product.precioCompra;
    } else if (isRecipePiece && !isCompraPiece) {
      // Receta cuenta piezas, producto se compra por peso (kg/g).
      // Necesita pezzatura. Sin merma — el chef compra piezas enteras
      // y "paga" la merma cuando las desconcha/limpia.
      const peso = pesoPorPiezaG(ing);
      if (peso === null) {
        unmeasuredCount++;
        continue;
      }
      const totalG = ing.qty * peso;
      // Precio está en €/unidadCompra. Si compra=kg, convertir gramos a kg.
      const factor = ing.product.unidadCompra === "kg" ? 1 / 1000 : 1;
      ingCost = totalG * factor * ing.product.precioCompra;
      // Si no hay override y el rango del banco es ancho, warning.
      if (
        ing.pesoCalculoG === null &&
        hasWideRange(ing.product)
      ) {
        warning = "wide_range";
      }
    } else if (!isRecipePiece && isCompraPiece) {
      // Receta usa peso (kg/g), producto se compra por unidad.
      // Necesita pezzatura inversa: cuántas piezas representa el peso.
      // Sin merma — el chef compra piezas enteras.
      const peso = pesoPorPiezaG(ing);
      if (peso === null) {
        unmeasuredCount++;
        continue;
      }
      const qtyEnG = recipeUnitRaw === "kg" ? ing.qty * 1000 : ing.qty;
      const piezasNecesarias = qtyEnG / peso;
      ingCost = piezasNecesarias * ing.product.precioCompra;
      if (
        ing.pesoCalculoG === null &&
        hasWideRange(ing.product)
      ) {
        warning = "wide_range";
      }
    } else {
      // Ambos en peso o ambos en volumen — flujo original con conversión
      // y merma (chef compra peso bruto, receta usa peso útil).
      const recipeUnit = recipeUnitRaw as ProductUnit;
      if (!KNOWN.has(recipeUnit)) {
        unmeasuredCount++;
        continue;
      }
      const qtyInPurchaseUnit = convertUnit(
        ing.qty,
        recipeUnit,
        ing.product.unidadCompra,
      );
      if (qtyInPurchaseUnit === null) {
        unmeasuredCount++;
        continue;
      }
      const merma =
        ing.mermaOverridePct !== null
          ? ing.mermaOverridePct
          : ing.product.mermaPct;
      const realPerPurchaseUnit = realCost(ing.product.precioCompra, merma);
      ingCost = realPerPurchaseUnit * qtyInPurchaseUnit;
    }

    if (ingCost === null) {
      unmeasuredCount++;
      continue;
    }
    computableTotalCents += ingCost;
    computableCount++;
    if (warning) {
      warningsByIdx.set(idx, warning);
      wideRangeCount++;
    }
  }

  const totalCents =
    computableCount > 0 ? Math.round(computableTotalCents) : null;
  const portions = input.portions && input.portions > 0 ? input.portions : 1;
  const perPortionCents =
    totalCents !== null ? Math.round(totalCents / portions) : null;
  // Food cost POR RACIÓN (decisión de producto): `salePriceCents` es el PVP de
  // UNA porción, como en cualquier restaurante. El % compara el coste POR RACIÓN
  // contra ese PVP, no el coste de la tanda entera (que inflaba el % ×porciones).
  // Base sobre totalCents/(portions*salePriceCents) y NO perPortionCents/salePrice
  // para no arrastrar el redondeo a centavo de perPortionCents.
  // Ej.: receta 4 porciones, coste total 20€ (2000c), PVP ración 10€ (1000c)
  //      → 2000/(4*1000) = 0,5 → 50%.
  const foodCostPct =
    totalCents !== null && input.salePriceCents && input.salePriceCents > 0
      ? Math.round((totalCents / (portions * input.salePriceCents)) * 100)
      : null;

  return {
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
  };
}
