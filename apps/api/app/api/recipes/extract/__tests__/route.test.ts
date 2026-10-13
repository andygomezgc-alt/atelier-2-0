import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const { db, guard, quota, extraction, log } = vi.hoisted(() => ({
  db: { product: { findMany: vi.fn() } },
  guard: { requireAuth: vi.fn() },
  quota: { reserveAiCall: vi.fn(), recordAiTokens: vi.fn() },
  extraction: { extractRecipeFromText: vi.fn() },
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@atelier/db", () => ({ prisma: db }));
vi.mock("@/lib/permissions-guard", () => ({
  requireAuth: guard.requireAuth,
  isNextResponse: (v: unknown) => v instanceof Response,
}));
vi.mock("@/lib/ai-quota", () => ({
  ...quota,
  aiQuotaExceededResponse: (retryAfter: number) =>
    Response.json({ code: "ai_daily_limit" }, { status: 429, headers: { "Retry-After": String(retryAfter) } }),
}));
vi.mock("@/lib/logger", () => ({ logger: log }));
vi.mock("@/lib/recipe-extraction", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/recipe-extraction")>()),
  extractRecipeFromText: extraction.extractRecipeFromText,
}));
vi.mock("@/lib/recipes/extraction-pipeline", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/recipes/extraction-pipeline")>();
  return { ...actual, standardizeExtractedRecipe: vi.fn(actual.standardizeExtractedRecipe) };
});

import { AiBudgetError } from "@/lib/ai/budget-policy";
import { RecipeExtractionError } from "@/lib/recipe-extraction";
import { standardizeExtractedRecipe } from "@/lib/recipes/extraction-pipeline";
import { POST } from "../route";

const CTX = { userId: "u1", role: "chef", restaurantId: "rest-1" };
const EXTRACTED = {
  title: "Calamar embutido al pimentón",
  portions: 16,
  ingredients: ["4 calamares de 350 g aprox. (tripa)", "40 g AOVE (aceite de chorizo)", "6 g ajo en pasta (aceite de chorizo)", "400 g rape limpio, muy frío (farsa)", "9 g sal fina (farsa)"],
  method: ["Limpia los calamares."],
  notes: "",
};

const post = (body: unknown) => POST(new NextRequest("https://test.local/api/recipes/extract", {
  method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body),
}));

beforeEach(() => {
  vi.clearAllMocks();
  guard.requireAuth.mockResolvedValue(CTX);
  quota.reserveAiCall.mockResolvedValue({ ok: true });
  quota.recordAiTokens.mockResolvedValue(undefined);
  db.product.findMany.mockResolvedValue([
    { id: "p-aove", name: "AOVE", aliases: [] },
    { id: "p-chorizo", name: "Chorizo", aliases: [] },
    { id: "p-rape", name: "Rape", aliases: [] },
  ]);
  extraction.extractRecipeFromText.mockResolvedValue(EXTRACTED);
});

describe("POST /api/recipes/extract", () => {
  it("requires the edit_recipe permission and returns the guard's response", async () => {
    guard.requireAuth.mockResolvedValue(NextResponse.json({ error: "No autorizado" }, { status: 401 }));
    const res = await post({ text: "Receta" });
    expect(res.status).toBe(401);
    expect(guard.requireAuth).toHaveBeenCalledWith(expect.any(NextRequest), "edit_recipe");
    expect(extraction.extractRecipeFromText).not.toHaveBeenCalled();
  });

  it("rejects invalid JSON and a missing text", async () => {
    expect((await post("{")).status).toBe(400);
    const res = await post({});
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Texto de receta requerido" });
    expect(quota.reserveAiCall).not.toHaveBeenCalled();
  });

  it("stops at the daily AI quota", async () => {
    quota.reserveAiCall.mockResolvedValue({ ok: false, retryAfter: 120 });
    const res = await post({ text: "Receta" });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("120");
    expect(extraction.extractRecipeFromText).not.toHaveBeenCalled();
  });

  it("maps an exhausted AI budget to its own response", async () => {
    extraction.extractRecipeFromText.mockRejectedValue(new AiBudgetError("ai_budget_exhausted", 30));
    const res = await post({ text: "Receta" });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "ai_budget_exhausted", code: "ai_budget_exhausted" });
  });

  it("an extraction failure is a 422 recipe_extraction_failed with the message", async () => {
    extraction.extractRecipeFromText.mockRejectedValue(new Error("recipe_extraction_incomplete"));
    const res = await post({ text: "Receta" });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "recipe_extraction_incomplete", code: "recipe_extraction_failed" });
    expect(log.error).toHaveBeenCalledWith("recipe_extract_failed", expect.objectContaining({ userId: "u1", error: "recipe_extraction_incomplete" }));
  });

  it("too many ingredients keep the 422 and carry the typed code in the message", async () => {
    extraction.extractRecipeFromText.mockRejectedValue(new RecipeExtractionError("recipe_too_many_ingredients"));
    const res = await post({ text: "Receta" });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "recipe_too_many_ingredients", code: "recipe_extraction_failed" });
  });

  it("runs the extraction through the shared pipeline: sections, notes and canonical lines", async () => {
    const res = await post({ text: "CHEF: calamar\nASISTENTE: **Calamar**" });
    expect(res.status).toBe(200);
    expect(extraction.extractRecipeFromText).toHaveBeenCalledWith("CHEF: calamar\nASISTENTE: **Calamar**", expect.any(Function));
    expect(db.product.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ restaurantId: "rest-1" }) }));
    expect(standardizeExtractedRecipe).toHaveBeenCalledWith(EXTRACTED, expect.arrayContaining([expect.objectContaining({ id: "p-aove" })]));

    const body = await res.json();
    expect(body.title).toBe("Calamar embutido al pimentón");
    expect(body.portions).toBe(16);
    expect(body.recipeIngredients[0]).toEqual({ rawText: "4 ud calamar", productId: null, qty: 4, unit: "unidad", section: "Tripa", note: null, pesoCalculoG: 350 });
    expect(body.recipeIngredients[1]).toMatchObject({ rawText: "40 g AOVE", productId: "p-aove", section: "Aceite de chorizo" });
    expect(body.recipeIngredients[3]).toMatchObject({ rawText: "400 g rape limpio", productId: null, section: "Farsa", note: "muy frío" });
    expect(body.pendingMatches).toEqual([{ ingredientIdx: 3, productId: "p-rape", productName: "Rape" }]);
    expect(body.contentJson).toEqual({
      ingredients: ["4 ud calamar", "40 g AOVE", "6 g ajo en pasta", "400 g rape limpio, muy frío", "9 g sal fina"],
      method: ["Limpia los calamares."],
      notes: "",
    });
    expect(log.info).toHaveBeenCalledWith("recipe_extract_from_text", expect.objectContaining({ ingredients: 5, exactMatches: 1, probableMatches: 1, section: 5 }));
  });

  it("records token usage for the user", async () => {
    await post({ text: "Receta" });
    const onUsage = extraction.extractRecipeFromText.mock.calls[0]![1] as (u: { inputTokens: number; outputTokens: number }) => void;
    onUsage({ inputTokens: 10, outputTokens: 5 });
    expect(quota.recordAiTokens).toHaveBeenCalledWith("u1", 10, 5);
  });
});
