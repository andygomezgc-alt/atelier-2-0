import { describe, test, expect } from "vitest";
import {
  computeRecipeAllergens,
  type IngredientForAllergens,
} from "./allergens-recipe";
import type { Allergen } from "@atelier/shared";

// Helpers para fixtures más legibles.
const linked = (allergen: Allergen | null): IngredientForAllergens => ({
  productId: "p1",
  product: { allergen },
});
const unlinked = (): IngredientForAllergens => ({
  productId: null,
  product: null,
});

describe("computeRecipeAllergens", () => {
  test("un producto compuesto puede declarar varios alérgenos", () => {
    const result = computeRecipeAllergens([{ productId: "sauce", product: { allergen: "milk", allergens: ["milk", "eggs", "mustard"], allergensReviewed: true } }], ["eggs"]);
    expect(result.allergens).toEqual(["eggs", "milk", "mustard"]);
    expect(result.allergensComplete).toBe(true);
  });
  test("distingue ninguno declarado de no revisado", () => {
    expect(computeRecipeAllergens([linked(null)], []).allergensComplete).toBe(false);
    expect(computeRecipeAllergens([{ productId: "salt", product: { allergen: null, allergens: [], allergensReviewed: true } }], []).allergensComplete).toBe(true);
  });
  test("las sugerencias y los manuales no completan una revisión pendiente", () => {
    const result = computeRecipeAllergens([linked("milk")], ["eggs"]);
    expect(result.allergens).toEqual(["eggs", "milk"]);
    expect(result.unreviewedIngredients).toBe(1);
    expect(result.allergensComplete).toBe(false);
  });
  test("cuenta ingredientes legacy sin filas estructuradas y productos ausentes", () => {
    const result = computeRecipeAllergens([{ productId: "missing", product: null }], [], { ingredients: ["sal", "pimienta"] });
    expect(result.unlinkedIngredients).toBe(2);
    expect(result.allergensComplete).toBe(false);
  });
  test("sin ingredientes ni manuales → vacío + 0 huérfanos", () => {
    expect(computeRecipeAllergens([], [])).toEqual({
      allergens: [],
      unlinkedIngredients: 0,
      unreviewedIngredients: 0,
      allergensComplete: false,
    });
  });

  test("solo manuales — sin ingredientes", () => {
    const out = computeRecipeAllergens([], ["milk", "eggs"]);
    expect(out.allergens).toEqual(["eggs", "milk"]); // orden EU: eggs(3) < milk(7)
    expect(out.unlinkedIngredients).toBe(0);
  });

  test("solo heredados — sin manuales", () => {
    const out = computeRecipeAllergens(
      [linked("fish"), linked("crustaceans"), linked("milk")],
      [],
    );
    // orden EU: crustaceans(2) < fish(4) < milk(7)
    expect(out.allergens).toEqual(["crustaceans", "fish", "milk"]);
    expect(out.unlinkedIngredients).toBe(0);
  });

  test("mix heredados + manuales — unión", () => {
    const out = computeRecipeAllergens(
      [linked("milk"), linked("fish")],
      ["gluten", "eggs"],
    );
    expect(out.allergens).toEqual(["gluten", "eggs", "fish", "milk"]);
    expect(out.unlinkedIngredients).toBe(0);
  });

  test("dedup — mismo alérgeno manual + heredado aparece una sola vez", () => {
    const out = computeRecipeAllergens([linked("milk")], ["milk"]);
    expect(out.allergens).toEqual(["milk"]);
    expect(out.unlinkedIngredients).toBe(0);
  });

  test("orden estable — input desordenado, output en ALLERGEN_ORDER", () => {
    const out = computeRecipeAllergens([], ["soy", "gluten", "lupin"]);
    // gluten(1) < soy(6) < lupin(13)
    expect(out.allergens).toEqual(["gluten", "soy", "lupin"]);
  });

  test("ingrediente con product.allergen=null no aporta y no es huérfano", () => {
    const out = computeRecipeAllergens([linked(null), linked("eggs")], []);
    expect(out.allergens).toEqual(["eggs"]);
    expect(out.unlinkedIngredients).toBe(0);
  });

  test("ingrediente con productId=null cuenta como huérfano y no aporta", () => {
    const out = computeRecipeAllergens([unlinked(), linked("eggs")], []);
    expect(out.allergens).toEqual(["eggs"]);
    expect(out.unlinkedIngredients).toBe(1);
  });

  test("mix completo — 3 ingredientes (1 con allergen, 1 sin allergen, 1 huérfano)", () => {
    const out = computeRecipeAllergens(
      [linked("fish"), linked(null), unlinked()],
      ["milk"],
    );
    expect(out.allergens).toEqual(["fish", "milk"]);
    expect(out.unlinkedIngredients).toBe(1);
  });

  test("múltiples huérfanos se cuentan correctamente", () => {
    const out = computeRecipeAllergens(
      [unlinked(), unlinked(), unlinked(), linked("eggs")],
      [],
    );
    expect(out.allergens).toEqual(["eggs"]);
    expect(out.unlinkedIngredients).toBe(3);
  });
});
