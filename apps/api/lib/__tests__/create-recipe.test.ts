import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({
  $transaction: vi.fn(), $queryRaw: vi.fn(),
  recipe: { findUnique: vi.fn(), create: vi.fn(), findUniqueOrThrow: vi.fn() },
  product: { findMany: vi.fn(), count: vi.fn(), create: vi.fn() },
  conversation: { findFirst: vi.fn() }, idea: { updateMany: vi.fn() }, recipeIngredient: { createMany: vi.fn() },
}));
vi.mock("@atelier/db", () => ({ prisma: db }));
import { saveNewRecipe } from "../create-recipe";
import type { CreateRecipeRequest } from "@atelier/shared";
const request: CreateRecipeRequest = { clientRequestId: "recipe-attempt", title: "Masa", portions: 4,
  contentJson: { ingredients: ["200 g harina", "100 g harina"], method: ["Mezclar"], notes: "" },
  recipeIngredients: [{ rawText: "200 g harina", createProductDraft: true }, { rawText: "100 g harina", createProductDraft: true }],
};
beforeEach(() => {
  vi.resetAllMocks();
  let recipe: Record<string, unknown> | null = null;
  db.$transaction.mockImplementation(async callback => callback(db));
  db.$queryRaw.mockResolvedValue([]);
  db.product.findMany.mockResolvedValue([]);
  db.product.count.mockResolvedValue(0);
  db.product.create.mockImplementation(async ({ data }) => ({ ...data, id: "flour", aliases: [] }));
  db.recipe.create.mockImplementation(async ({ data }) => { recipe = { ...data, id: "saved", deletedAt: null }; return recipe; });
  db.recipe.findUnique.mockImplementation(async () => recipe);
  db.recipe.findUniqueOrThrow.mockImplementation(async () => recipe);
  db.conversation.findFirst.mockResolvedValue(null);
});
describe("atomic, retryable recipe creation", () => {
  it("reuses the original recipe for an identical retry", async () => {
    expect((await saveNewRecipe("r1", "u1", request)).reused).toBe(false);
    expect((await saveNewRecipe("r1", "u1", request)).reused).toBe(true);
    expect(db.recipe.create).toHaveBeenCalledOnce();
    expect(db.product.create).toHaveBeenCalledOnce();
    expect(db.recipeIngredient.createMany).toHaveBeenCalledOnce();
    expect(db.recipe.findUnique.mock.calls[1]![0].where).toEqual({ restaurantId_authorId_clientRequestId: { restaurantId: "r1", authorId: "u1", clientRequestId: "recipe-attempt" } });
  });
  it("rejects changed content under the same identifier", async () => {
    await saveNewRecipe("r1", "u1", request);
    await expect(saveNewRecipe("r1", "u1", { ...request, title: "Otra" })).rejects.toMatchObject({ code: "recipe_save_conflict", status: 409 });
    expect(db.recipe.create).toHaveBeenCalledOnce();
  });
  it("creates one product for repeated ingredients while preserving individual quantities", async () => {
    await saveNewRecipe("r1", "u1", request);
    expect(db.product.create).toHaveBeenCalledOnce();
    expect(db.recipeIngredient.createMany.mock.calls[0]![0].data).toMatchObject([
      { productId: "flour", qty: 200, unit: "g", position: 0 }, { productId: "flour", qty: 100, unit: "g", position: 1 },
    ]);
    expect(db.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(db.product.create.mock.invocationCallOrder[0]!);
  });
  it("reuses exact bank matches, without accepting a probable match automatically", async () => {
    db.product.findMany.mockResolvedValue([{ id: "existing", name: "Harina", aliases: [] }]);
    await saveNewRecipe("r1", "u1", request);
    expect(db.product.create).not.toHaveBeenCalled();
    expect(db.recipeIngredient.createMany.mock.calls[0]![0].data[0].productId).toBe("existing");
  });
  it("keeps explicitly unlinked ingredients unlinked", async () => {
    await saveNewRecipe("r1", "u1", { ...request, recipeIngredients: [{ rawText: "200 g harina" }] });
    expect(db.product.create).not.toHaveBeenCalled();
    expect(db.recipeIngredient.createMany.mock.calls[0]![0].data[0].productId).toBeNull();
  });
  it("rejects another restaurant's source conversation before creating anything", async () => {
    await expect(saveNewRecipe("r1", "u1", { ...request, sourceConversationId: "foreign" })).rejects.toMatchObject({ code: "invalid_conversation_reference" });
    expect(db.conversation.findFirst.mock.calls[0]![0].where).toEqual({ id: "foreign", restaurantId: "r1" });
    expect(db.product.create).not.toHaveBeenCalled();
    expect(db.recipe.create).not.toHaveBeenCalled();
  });
  it("rejects invalid product references before creating any draft", async () => {
    await expect(saveNewRecipe("r1", "u1", { ...request, recipeIngredients: [...request.recipeIngredients!, { rawText: "sal", productId: "foreign" }] })).rejects.toMatchObject({ code: "invalid_product_reference" });
    expect(db.product.create).not.toHaveBeenCalled();
  });
  it("propagates a write failure out of the transaction instead of returning success", async () => {
    db.recipeIngredient.createMany.mockRejectedValue(new Error("write failed"));
    await expect(saveNewRecipe("r1", "u1", request)).rejects.toThrow("write failed");
    expect(db.recipe.findUniqueOrThrow).not.toHaveBeenCalled();
  });
});
