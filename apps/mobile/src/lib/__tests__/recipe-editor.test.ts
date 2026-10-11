import { describe, expect, it } from "vitest";
import { buildRecipeRequestBody, editIngredientText, selectIngredientProduct, recipeIngredientPayload } from "../recipe-editor";

describe("recipe editor costing data", () => {
  const original = { rawText: "2 piezas merluza", productId: "fish", qty: 2, unit: "piezas", pesoCalculoG: 450, mermaOverridePct: 12, pezzatura: "400-500 g" };
  it("retains quantity and unit when selecting a bank suggestion", () => {
    const selected = selectIngredientProduct({ rawText: "200g hari", productId: null }, { id: "flour", name: "Harina 00" });
    expect(recipeIngredientPayload(selected)).toMatchObject({ rawText: "200 g Harina 00", qty: 200, unit: "g", productId: "flour" });
  });
  it("preserves all structured fields through an unchanged edit and save", () => {
    expect(recipeIngredientPayload(editIngredientText(original, original.rawText))).toEqual(original);
  });
  it("updates quantity without losing the same product and its overrides", () => {
    expect(editIngredientText(original, "3 piezas merluza")).toEqual({ ...original, rawText: "3 piezas merluza", qty: 3, unit: "unidad" });
  });
  it("clears old product overrides when changing the ingredient", () => {
    expect(editIngredientText(original, "3 piezas patata")).toMatchObject({ productId: null, qty: 3, pesoCalculoG: null, mermaOverridePct: null });
  });
  it("keeps explicit quantities that cannot be parsed from text", () => {
    const value = { ...original, rawText: "merluza para el pase", qty: 0.75, unit: "kg" };
    expect(recipeIngredientPayload(value)).toEqual(value);
    expect(selectIngredientProduct(value, { id: "fish", name: "Merluza" })).toMatchObject({ qty: 0.75, unit: "kg", pesoCalculoG: 450 });
  });
});

describe("recipe editor request body", () => {
  const input = {
    title: "  Merluza al horno  ",
    portionsText: " 2 ",
    workingIngredients: [
      { rawText: "200 g merluza", productId: "fish", qty: 200, unit: "g", pesoCalculoG: 180, mermaOverridePct: 10 },
    ],
    method: ["  Preparar  ", "", "  Hornear  "],
    notes: "  Servir caliente  ",
    clientRequestId: "save-attempt",
    sourceConversationId: "conversation",
    origin: "import" as const,
    editId: null as string | null,
  };
  const content = {
    ingredients: ["200 g merluza"],
    method: ["Preparar", "Hornear"],
    notes: "Servir caliente",
  };
  const recipeIngredients = [{ ...input.workingIngredients[0] }];

  it("builds the imported create request without changing the editor state", () => {
    const before = structuredClone(input);
    expect(buildRecipeRequestBody(input)).toEqual({
      title: "Merluza al horno",
      portions: 2,
      contentJson: content,
      recipeIngredients,
      clientRequestId: "save-attempt",
      sourceConversationId: "conversation",
      origin: "import",
    });
    expect(input).toEqual(before);
  });

  it("omits origin for a manual create request", () => {
    expect(buildRecipeRequestBody({ ...input, portionsText: "", sourceConversationId: null, origin: null })).toEqual({
      title: "Merluza al horno",
      portions: null,
      contentJson: content,
      recipeIngredients,
      clientRequestId: "save-attempt",
    });
  });

  it("never sends origin when editing, even if an imported draft supplies it", () => {
    expect(buildRecipeRequestBody({ ...input, editId: "existing-recipe" })).toEqual({
      title: "Merluza al horno",
      portions: 2,
      contentJson: content,
      recipeIngredients,
      clientRequestId: "save-attempt",
      sourceConversationId: "conversation",
    });
  });
});
