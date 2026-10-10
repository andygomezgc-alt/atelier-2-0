import { describe, expect, it } from "vitest";
import { CreateRecipeRequestSchema, CreateRestaurantRequestSchema } from "./api-contract";

describe("CreateRestaurantRequestSchema city", () => {
  it("retains an optional city", () => {
    expect(CreateRestaurantRequestSchema.parse({ name: "Kokoo", city: "Ancona" })).toEqual({ name: "Kokoo", city: "Ancona" });
  });

  it("trims the city", () => {
    expect(CreateRestaurantRequestSchema.parse({ name: "Kokoo", city: "  Ancona, Marche  " })).toEqual({ name: "Kokoo", city: "Ancona, Marche" });
  });

  it("retains a city of exactly 80 characters after trimming", () => {
    const city = "a".repeat(80);
    expect(CreateRestaurantRequestSchema.parse({ name: "Kokoo", city: `  ${city}  ` })).toEqual({ name: "Kokoo", city });
  });

  it("rejects a city of 81 characters", () => {
    expect(CreateRestaurantRequestSchema.safeParse({ name: "Kokoo", city: "a".repeat(81) }).success).toBe(false);
  });

  it("accepts an omitted city without adding it", () => {
    expect(CreateRestaurantRequestSchema.parse({ name: "Kokoo" })).toEqual({ name: "Kokoo" });
  });
});

describe("CreateRecipeRequestSchema origin", () => {
  const recipe = { title: "Risotto", contentJson: { ingredients: [], method: [], notes: "" } };

  it("retains the import origin", () => {
    expect(CreateRecipeRequestSchema.parse({ ...recipe, origin: "import" })).toEqual({ ...recipe, origin: "import" });
  });

  it("accepts an omitted origin without adding it", () => {
    expect(CreateRecipeRequestSchema.parse(recipe)).toEqual(recipe);
  });

  it("rejects any origin other than import", () => {
    expect(CreateRecipeRequestSchema.safeParse({ ...recipe, origin: "manual" }).success).toBe(false);
  });
});
