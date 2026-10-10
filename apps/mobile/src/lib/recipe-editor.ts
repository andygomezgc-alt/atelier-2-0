import { parseIngredient, type CreateRecipeRequest, type RecipeIngredientInput } from "@atelier/shared";

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

type RecipeRequestInput = {
  title: string;
  portionsText: string;
  workingIngredients: IngredientValue[];
  method: string[];
  notes: string;
  clientRequestId: string;
  sourceConversationId: string | null;
  origin?: "import" | null;
  editId: string | null;
};

/** Import origin belongs only to creation, never to an existing recipe edit. */
export function buildRecipeRequestBody(input: RecipeRequestInput): CreateRecipeRequest {
  const { title, portionsText, workingIngredients, method, notes, clientRequestId, sourceConversationId, editId } = input;
  const origin = editId ? null : input.origin;
  const recipeIngredients = workingIngredients.map(recipeIngredientPayload);
  return {
    title: title.trim(),
    portions: portionsText.trim() ? Number(portionsText) : null,
    contentJson: {
      ingredients: recipeIngredients.map((ingredient) => ingredient.rawText),
      method: method.map((step) => step.trim()).filter(Boolean),
      notes: notes.trim(),
    },
    recipeIngredients,
    clientRequestId,
    ...(sourceConversationId ? { sourceConversationId } : {}),
    ...(origin ? { origin } : {}),
  };
}
