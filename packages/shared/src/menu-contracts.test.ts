import { expect, it } from "vitest";
import { MenuServiceChargesSchema, PatchMenuItemRequestSchema, ActivateMenuStyleSchema, MenuListItemSchema, RecipeListItemSchema } from "./api-contract";
const charge = { id: "cover", name: "Coperto", price: 400, perPerson: true };
it("accepts menu charges in cents, including a complimentary charge", () => {
  expect(MenuServiceChargesSchema.parse([charge, { ...charge, id: "free", price: 0 }])).toHaveLength(2);
});
it("rejects blank names, fractional cents, negative amounts, duplicate IDs and too many charges", () => {
  for (const rows of [[{ ...charge, name: " " }], [{ ...charge, price: 1.5 }], [{ ...charge, price: -1 }], [charge, charge], Array.from({ length: 21 }, (_, i) => ({ ...charge, id: String(i) }))]) {
    expect(MenuServiceChargesSchema.safeParse(rows).success).toBe(false);
  }
});
it("accepts kg or portion but never arbitrary price units", () => {
  expect(PatchMenuItemRequestSchema.parse({ priceUnit: "kg" }).priceUnit).toBe("kg");
  expect(PatchMenuItemRequestSchema.safeParse({ priceUnit: "g" }).success).toBe(false);
});
it("requires the active version observed by the client to avoid overwriting a newer choice", () => {
  expect(ActivateMenuStyleSchema.safeParse({}).success).toBe(false);
  expect(ActivateMenuStyleSchema.safeParse({ expectedActiveVersionId: null }).success).toBe(true);
});
it("menu list items accept an optional cost summary, so older payloads still parse", () => {
  const menu = { id: "m1", name: "Carta", season: null, itemCount: 3, updatedAt: "2026-10-19T10:00:00Z", inService: true };
  expect(MenuListItemSchema.parse(menu)).not.toHaveProperty("costSummary");
  const costSummary = { avgDishCostCents: 320, marginPct: 71, pricedDishes: 2, totalDishes: 3 };
  expect(MenuListItemSchema.parse({ ...menu, costSummary }).costSummary).toEqual(costSummary);
  expect(MenuListItemSchema.parse({ ...menu, costSummary: null }).costSummary).toBeNull();
  expect(MenuListItemSchema.safeParse({ ...menu, costSummary: { ...costSummary, pricedDishes: -1 } }).success).toBe(false);
});
it("recipe list items accept a food cost % and parse without one", () => {
  const recipe = { id: "r1", title: "Tarta", state: "approved", priority: false, version: 1, authorName: "Chef", updatedAt: "2026-10-19T10:00:00Z", perPortionCents: 120, salePrice: 900, portions: 8 };
  expect(RecipeListItemSchema.parse(recipe).foodCostPct).toBeUndefined();
  expect(RecipeListItemSchema.parse({ ...recipe, foodCostPct: 13 }).foodCostPct).toBe(13);
  expect(RecipeListItemSchema.parse({ ...recipe, foodCostPct: null }).foodCostPct).toBeNull();
});
