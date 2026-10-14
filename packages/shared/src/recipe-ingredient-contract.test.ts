import { describe, expect, it } from "vitest";
import {
  CreateRecipeRequestSchema,
  MAX_RECIPE_INGREDIENTS,
  RecipeCostSchema,
  RecipeDetailSchema,
  ExtractedRecipeResponseSchema,
  PatchRecipeRequestSchema,
  RecipeIngredientInputSchema,
  RecipeIngredientResponseSchema,
} from "./api-contract";

const content = { ingredients: ["4 ud calamar, tubos de 15–18 cm"], method: [], notes: "" };

describe("recipe ingredient section and note — input", () => {
  it("accepts an optional section (≤80) and note (≤300), or null", () => {
    const parsed = RecipeIngredientInputSchema.parse({
      rawText: "4 ud calamar", section: "Calamar", note: "tubos de 15–18 cm",
    });
    expect(parsed).toMatchObject({ section: "Calamar", note: "tubos de 15–18 cm" });
    expect(RecipeIngredientInputSchema.parse({ rawText: "sal", section: null, note: null }))
      .toMatchObject({ section: null, note: null });
  });

  it("still accepts an old client that sends neither field", () => {
    const parsed = RecipeIngredientInputSchema.parse({ rawText: "sal" });
    expect(parsed.section).toBeUndefined();
    expect(parsed.note).toBeUndefined();
  });

  it("rejects a section over 80 or a note over 300 characters", () => {
    expect(RecipeIngredientInputSchema.safeParse({ rawText: "sal", section: "x".repeat(81) }).success).toBe(false);
    expect(RecipeIngredientInputSchema.safeParse({ rawText: "sal", note: "x".repeat(301) }).success).toBe(false);
  });

  it("create and PATCH carry both fields through", () => {
    const row = { rawText: "40 g AOVE", section: "Aceite de chorizo", note: null };
    const created = CreateRecipeRequestSchema.parse({ title: "Calamar", contentJson: content, recipeIngredients: [row] });
    expect(created.recipeIngredients![0]).toMatchObject(row);
    const patched = PatchRecipeRequestSchema.parse({ recipeIngredients: [row] });
    expect(patched.recipeIngredients![0]).toMatchObject(row);
  });

  it("accepts up to 100 ingredients on create and PATCH, and rejects 101", () => {
    const rows = (n: number) => Array.from({ length: n }, () => ({ rawText: "sal" }));
    const lines = (n: number) => ({ ...content, ingredients: Array.from({ length: n }, () => "sal") });
    expect(MAX_RECIPE_INGREDIENTS).toBe(100);
    expect(CreateRecipeRequestSchema.safeParse({ title: "Pichón", contentJson: lines(100), recipeIngredients: rows(100) }).success).toBe(true);
    expect(PatchRecipeRequestSchema.safeParse({ contentJson: lines(100), recipeIngredients: rows(100) }).success).toBe(true);
    expect(PatchRecipeRequestSchema.safeParse({ recipeIngredients: rows(101) }).success).toBe(false);
    expect(PatchRecipeRequestSchema.safeParse({ contentJson: lines(101) }).success).toBe(false);
  });

  it("keeps the 50-step cap on the method", () => {
    const method = (n: number) => Array.from({ length: n }, () => "Remover");
    expect(PatchRecipeRequestSchema.safeParse({ contentJson: { ...content, method: method(50) } }).success).toBe(true);
    expect(PatchRecipeRequestSchema.safeParse({ contentJson: { ...content, method: method(51) } }).success).toBe(false);
  });
});

describe("recipe ingredient section and note — detail response", () => {
  it("a recipe detail with 100 ingredients and 100 cost lines parses", () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({ ...row, id: `ri-${i}`, position: i }));
    const lines = rows.map((r) => ({
      ingredientId: r.id, position: r.position, status: "ok", costCents: 10, productId: null, recipeUnit: "g", purchaseUnit: "kg",
    }));
    expect(RecipeDetailSchema.shape.recipeIngredients.safeParse(rows).success).toBe(true);
    expect(RecipeDetailSchema.shape.recipeIngredients.safeParse([...rows, row]).success).toBe(false);
    expect(RecipeCostSchema.shape.lines.safeParse(lines).success).toBe(true);
    expect(RecipeCostSchema.shape.lines.safeParse([...lines, lines[0]]).success).toBe(false);
  });

  const row = {
    id: "ri-1", position: 0, rawText: "4 ud calamar", qty: 4, unit: "unidad", pezzatura: null,
    mermaOverridePct: null, pesoCalculoG: 350, pezzaturaWarning: null, product: null,
  };

  it("exposes section and note", () => {
    expect(RecipeIngredientResponseSchema.parse({ ...row, section: "Calamar", note: "tubos de 15–18 cm" }))
      .toMatchObject({ section: "Calamar", note: "tubos de 15–18 cm" });
  });

  it("still parses a payload from an API without the fields", () => {
    expect(RecipeIngredientResponseSchema.safeParse(row).success).toBe(true);
  });
});

describe("ExtractedRecipeResponseSchema", () => {
  const legacy = {
    title: "Calamar", portions: 4, contentJson: content,
    recipeIngredients: [{ rawText: "4 ud calamar", productId: null }],
    pendingMatches: [{ ingredientIdx: 0, productId: "p1", productName: "Calamar" }],
  };

  it("accepts the shape the extract, upload and gdoc routes return today", () => {
    expect(ExtractedRecipeResponseSchema.safeParse(legacy).success).toBe(true);
    expect(ExtractedRecipeResponseSchema.safeParse({ ...legacy, portions: undefined }).success).toBe(true);
  });

  it("accepts the optional structured fields on each ingredient", () => {
    const rich = {
      ...legacy,
      recipeIngredients: [{
        rawText: "4 ud calamar", productId: null, qty: 4, unit: "unidad",
        section: "Calamar", note: "tubos de 15–18 cm", pesoCalculoG: 350,
      }],
    };
    expect(ExtractedRecipeResponseSchema.parse(rich).recipeIngredients[0]).toMatchObject({
      qty: 4, unit: "unidad", section: "Calamar", note: "tubos de 15–18 cm", pesoCalculoG: 350,
    });
  });

  it("accepts up to 100 ingredients and probable matches, and rejects 101", () => {
    const rows = (n: number) => Array.from({ length: n }, () => ({ rawText: "sal", productId: null }));
    const matches = (n: number) => Array.from({ length: n }, (_, i) => ({ ingredientIdx: i, productId: "p1", productName: "Sal" }));
    const ingredients = Array.from({ length: 100 }, () => "sal");
    expect(ExtractedRecipeResponseSchema.safeParse({
      ...legacy, contentJson: { ...content, ingredients }, recipeIngredients: rows(100), pendingMatches: matches(100),
    }).success).toBe(true);
    expect(ExtractedRecipeResponseSchema.safeParse({ ...legacy, recipeIngredients: rows(101) }).success).toBe(false);
  });
});
