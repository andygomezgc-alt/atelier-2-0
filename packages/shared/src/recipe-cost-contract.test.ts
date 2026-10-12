import { describe, expect, it } from "vitest";
import { CostLineStatusSchema, RecipeCostSchema } from "./api-contract";

const aggregates = {
  totalCents: 22,
  perPortionCents: null,
  foodCostPct: null,
  totalIngredients: 2,
  computableCount: 1,
  missingPriceCount: 0,
  unmeasuredCount: 1,
  unlinkedCount: 0,
  wideRangeCount: 0,
};

describe("recipe cost lines contract", () => {
  it("still accepts a cost payload without lines (API before per-ingredient lines)", () => {
    const parsed = RecipeCostSchema.parse(aggregates);
    expect(parsed.lines).toBeUndefined();
  });

  it("accepts one line per ingredient with its status", () => {
    const lines = [
      { ingredientId: "ri-1", position: 0, status: "ok", costCents: 22, productId: "p-oil", recipeUnit: "g", purchaseUnit: "l" },
      { ingredientId: "ri-2", position: 1, status: "needs_density", costCents: null, productId: "p-cream", recipeUnit: "g", purchaseUnit: "l" },
      { ingredientId: "ri-3", position: 2, status: "no_product", costCents: null, productId: null, recipeUnit: null, purchaseUnit: null },
    ];
    expect(RecipeCostSchema.parse({ ...aggregates, lines }).lines).toEqual(lines);
  });

  it("lists exactly the eight line statuses", () => {
    expect(CostLineStatusSchema.options).toEqual([
      "ok",
      "no_product",
      "no_price",
      "no_quantity",
      "needs_density",
      "needs_piece_weight",
      "incompatible_unit",
      "invalid_merma",
    ]);
  });
});
