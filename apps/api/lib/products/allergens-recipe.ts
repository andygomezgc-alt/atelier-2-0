// Cómputo de alérgenos de una receta — Reg. EU 1169/2011 Anexo II.
//
// Reusa el patrón de cost.ts: el helper vive server-side, lo invoca la
// projection y mobile recibe `allergens` + `unlinkedIngredients` precomputados.
// Single source of truth; el cliente no recalcula.
//
// El resultado es la unión de:
//   1. los `product.allergen` no-null de cada ingrediente enlazado, +
//   2. los `manualAllergens[]` que el chef agregó desde el "+" de la preview.
//
// Ingredientes con `productId === null` (legacy o producto borrado del banco
// con onDelete=SetNull) no aportan alérgenos y suman a `unlinkedIngredients`,
// que la UI usa para mostrar "X ingredientes sin enlazar — alérgenos
// incompletos" sobre el plato (Fase 3).

import { ALLERGEN_ORDER, type Allergen } from "@atelier/shared";

export type IngredientForAllergens = {
  productId: string | null;
  product: { allergen: Allergen | null; allergens?: Allergen[]; allergensReviewed?: boolean } | null;
};

export type RecipeAllergensResult = {
  allergens: Allergen[];
  unlinkedIngredients: number;
  unreviewedIngredients: number;
  allergensComplete: boolean;
};

export function computeRecipeAllergens(
  ingredients: ReadonlyArray<IngredientForAllergens>,
  manualAllergens: ReadonlyArray<Allergen>,
  contentJson?: unknown,
): RecipeAllergensResult {
  const set = new Set<Allergen>();
  let unlinkedIngredients = 0;
  let unreviewedIngredients = 0;

  for (const ing of ingredients) {
    // El ingrediente puede tener productId pero `product=null` si el query no
    // hizo include. En esta app la projection siempre incluye el product, así
    // que `productId===null` (sin enlazar) es lo único que cuenta como huérfano.
    if (ing.productId === null || ing.product === null) {
      unlinkedIngredients += 1;
      continue;
    }
    if (!ing.product.allergensReviewed) unreviewedIngredients += 1;
    const declared = ing.product.allergens?.length || ing.product.allergensReviewed
      ? ing.product.allergens ?? [] : ing.product.allergen ? [ing.product.allergen] : [];
    for (const allergen of declared) set.add(allergen);
  }

  for (const a of manualAllergens) {
    set.add(a);
  }

  // Orden estable Reg. EU 1169 (no del orden de inserción en el set ni del
  // orden de ingredientes). Leyendas y iconos no deben oscilar entre llamadas.
  const allergens: Allergen[] = [];
  for (const a of ALLERGEN_ORDER) {
    if (set.has(a)) allergens.push(a);
  }

  // Legacy recipes may still have ingredient text with no structured rows.
  const raw = contentJson && typeof contentJson === "object" && "ingredients" in contentJson ? contentJson.ingredients : null;
  const textCount = Array.isArray(raw) ? raw.filter(value => typeof value === "string" && value.trim()).length : 0;
  unlinkedIngredients += Math.max(0, textCount - ingredients.length);
  const allergensComplete = ingredients.length > 0 && unlinkedIngredients === 0 && unreviewedIngredients === 0;
  return { allergens, unlinkedIngredients, unreviewedIngredients, allergensComplete };
}
