import { parseIngredient, type RecipeIngredientInput } from "@atelier/shared";

export type IngredientValue = RecipeIngredientInput & { productId: string | null };

/** Reparse edited quantities, but retain product-specific settings only for the same ingredient. */
export function editIngredientText(value: IngredientValue, rawText: string): IngredientValue {
  if (rawText === value.rawText) return value;
  const before = parseIngredient(value.rawText);
  const after = parseIngredient(rawText);
  const sameIngredient = before.name.trim().toLowerCase() === after.name.trim().toLowerCase();
  return {
    ...value, rawText, qty: after.quantity, unit: after.unit,
    productId: sameIngredient ? value.productId : null,
    pezzatura: sameIngredient ? value.pezzatura : null,
    pesoCalculoG: sameIngredient ? value.pesoCalculoG : null,
    mermaOverridePct: sameIngredient ? value.mermaOverridePct : null,
  };
}

export function selectIngredientProduct(
  value: IngredientValue, product: { id: string; name: string },
): IngredientValue {
  const parsed = parseIngredient(value.rawText);
  const qty = value.qty !== undefined ? value.qty : parsed.quantity;
  const unit = value.unit !== undefined ? value.unit : parsed.unit;
  const sameProduct = value.productId === product.id;
  return {
    ...value,
    rawText: qty !== null && unit ? `${qty} ${unit} ${product.name}` : product.name,
    qty, unit, productId: product.id,
    pezzatura: sameProduct ? value.pezzatura : null,
    pesoCalculoG: sameProduct ? value.pesoCalculoG : null,
    mermaOverridePct: sameProduct ? value.mermaOverridePct : null,
  };
}

/** Used at the editor/API boundary: keep explicitly supplied costing fields intact. */
export function recipeIngredientPayload(value: IngredientValue): RecipeIngredientInput {
  return { ...value, rawText: value.rawText.trim() };
}
