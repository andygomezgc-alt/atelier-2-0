import {
  STANDARD_UNITS,
  formatIngredientLine,
  formatQuantity,
  parseIngredient,
  standardizeIngredientLine,
  type CreateRecipeRequest,
  type RecipeIngredientInput,
  type StandardUnit,
} from "@atelier/shared";

export type IngredientValue = RecipeIngredientInput & { productId: string | null };

/** The clean ingredient name (no quantity, note or piece weight): what bank matching compares. */
export function ingredientMatchName(rawText: string): string {
  return standardizeIngredientLine(rawText).ingredient.name.trim() || rawText.trim();
}

/** Reparse edited quantities, but retain product-specific settings only for the same ingredient. */
export function editIngredientText(value: IngredientValue, rawText: string): IngredientValue {
  if (rawText === value.rawText) return value;
  const after = parseIngredient(rawText);
  const sameIngredient =
    ingredientMatchName(value.rawText).toLowerCase() === ingredientMatchName(rawText).toLowerCase();
  return {
    ...value, rawText, qty: after.quantity, unit: after.unit,
    productId: sameIngredient ? value.productId : null,
    pezzatura: sameIngredient ? value.pezzatura : null,
    pesoCalculoG: sameIngredient ? value.pesoCalculoG : null,
    mermaOverridePct: sameIngredient ? value.mermaOverridePct : null,
  };
}

function standardUnit(unit: string): StandardUnit | null {
  if (unit === "piezas") return "unidad";
  return (STANDARD_UNITS as readonly string[]).includes(unit) ? (unit as StandardUnit) : null;
}

/** Canonical line for a picked product: "400 g Rape limpio", "4 ud Calamar", decimals with a comma. */
function productLine(qty: number | null, unit: string | null, name: string): string {
  if (qty === null || !unit) return name;
  const std = standardUnit(unit);
  if (!std) return `${formatQuantity(qty)} ${unit} ${name}`;
  return formatIngredientLine({ section: null, qty, unit: std, name, note: null, pieceWeightG: null });
}

export function selectIngredientProduct(
  value: IngredientValue, product: { id: string; name: string },
): IngredientValue {
  const parsed = parseIngredient(value.rawText);
  const standard = standardizeIngredientLine(value.rawText).ingredient;
  const qty = value.qty !== undefined ? value.qty : parsed.quantity;
  const given = value.unit !== undefined ? value.unit : parsed.unit;
  // The line says "ud", so the unit must agree with it ("piezas" is the old spelling).
  const unit = given === "piezas" ? "unidad" : given;
  const sameProduct = value.productId === product.id;
  const line = productLine(qty, unit, product.name);
  return {
    ...value,
    rawText: standard.note ? `${line}, ${standard.note}` : line,
    qty, unit, productId: product.id,
    pezzatura: sameProduct ? value.pezzatura : null,
    // A piece weight written in the line ("de 350 g") belongs to the line, not to the old product.
    pesoCalculoG: sameProduct ? value.pesoCalculoG : standard.pieceWeightG,
    mermaOverridePct: sameProduct ? value.mermaOverridePct : null,
  };
}

/**
 * Editor row for a saved or extracted ingredient. The chef edits one text, so
 * the note goes back into the line (the display line: rawText + ", " + note)
 * and is sent as null; the server splits it again on save. The section rides
 * along unchanged; the editor only shows it.
 */
export function toEditorIngredient(
  row: RecipeIngredientInput & { productId?: string | null },
): IngredientValue {
  return {
    ...row,
    rawText: row.note ? `${row.rawText}, ${row.note}` : row.rawText,
    productId: row.productId ?? null,
    pesoCalculoG: row.pesoCalculoG ?? null,
    section: row.section ?? null,
    note: null,
  };
}

/** Appends an empty ingredient in the section of the last row. */
export function addIngredientRow(rows: readonly IngredientValue[]): IngredientValue[] {
  return [...rows, { rawText: "", productId: null, section: rows[rows.length - 1]?.section ?? null }];
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
