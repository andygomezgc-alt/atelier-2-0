import { describe, expect, it } from "vitest";
import { editIngredientText, selectIngredientProduct, recipeIngredientPayload } from "../recipe-editor";

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
