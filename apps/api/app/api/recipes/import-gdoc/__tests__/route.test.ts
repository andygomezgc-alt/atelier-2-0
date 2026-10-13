import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const { db, guard, quota, extraction, log } = vi.hoisted(() => ({
  db: { product: { findMany: vi.fn() } },
  guard: { requireAuth: vi.fn() },
  quota: { reserveAiCall: vi.fn(), recordAiTokens: vi.fn() },
  extraction: { extractRecipeFromFile: vi.fn() },
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
  extractRecipeFromFile: extraction.extractRecipeFromFile,
}));
vi.mock("@/lib/recipes/extraction-pipeline", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/recipes/extraction-pipeline")>();
  return { ...actual, standardizeExtractedRecipe: vi.fn(actual.standardizeExtractedRecipe) };
});

import { AiBudgetError } from "@/lib/ai/budget-policy";
import { DOCX_MIME } from "@/lib/recipe-extraction";
import { standardizeExtractedRecipe } from "@/lib/recipes/extraction-pipeline";
import { POST } from "../route";

const CTX = { userId: "u1", role: "chef", restaurantId: "rest-1" };
const URL_OK = "https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/edit";
const DOCX_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
const EXTRACTED = {
  title: "Parmigiana di melanzane",
  portions: null,
  ingredients: ["3 melanzane da 300 g circa", "Per la panatura:", "100 g pangrattato", "1 cucchiaio di olio extravergine"],
  method: ["Friggi le melanzane."],
  notes: "",
};

const post = (body: unknown) => POST(new NextRequest("https://test.local/api/recipes/import-gdoc", {
  method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body),
}));
const google = (body: BodyInit, contentType: string, status = 200) =>
  vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status, headers: { "content-type": contentType } })));

beforeEach(() => {
  vi.clearAllMocks();
  guard.requireAuth.mockResolvedValue(CTX);
  quota.reserveAiCall.mockResolvedValue({ ok: true });
  quota.recordAiTokens.mockResolvedValue(undefined);
  db.product.findMany.mockResolvedValue([{ id: "p-pan", name: "Pangrattato", aliases: [] }]);
  extraction.extractRecipeFromFile.mockResolvedValue(EXTRACTED);
  google(DOCX_BYTES, DOCX_MIME);
});
afterEach(() => vi.unstubAllGlobals());

describe("POST /api/recipes/import-gdoc", () => {
  it("requires the edit_recipe permission and returns the guard's response", async () => {
    guard.requireAuth.mockResolvedValue(NextResponse.json({ error: "No autorizado" }, { status: 401 }));
    expect((await post({ url: URL_OK })).status).toBe(401);
    expect(guard.requireAuth).toHaveBeenCalledWith(expect.any(NextRequest), "edit_recipe");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects invalid JSON and links that are not Google Docs", async () => {
    expect((await post("{")).status).toBe(400);
    const res = await post({ url: "https://example.com/doc" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Enlace de Google Docs no válido" });
  });

  it("a private document answers gdoc_access_denied without spending AI quota", async () => {
    google("<html>login</html>", "text/html; charset=utf-8");
    const res = await post({ url: URL_OK });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: "gdoc_access_denied" });
    expect(quota.reserveAiCall).not.toHaveBeenCalled();
  });

  it("stops at the daily AI quota", async () => {
    quota.reserveAiCall.mockResolvedValue({ ok: false, retryAfter: 60 });
    expect((await post({ url: URL_OK })).status).toBe(429);
    expect(extraction.extractRecipeFromFile).not.toHaveBeenCalled();
  });

  it("maps an exhausted AI budget and extraction failures as before", async () => {
    extraction.extractRecipeFromFile.mockRejectedValueOnce(new AiBudgetError("ai_budget_exhausted", 5));
    expect((await post({ url: URL_OK })).status).toBe(429);

    extraction.extractRecipeFromFile.mockRejectedValueOnce(new Error("El archivo no contiene texto legible"));
    const res = await post({ url: URL_OK });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "El archivo no contiene texto legible", code: "recipe_extraction_failed" });
    expect(log.error).toHaveBeenCalledWith("recipe_import_gdoc_failed", expect.objectContaining({ userId: "u1" }));
  });

  it("extracts the exported DOCX through the shared pipeline: sections, notes and canonical lines", async () => {
    const res = await post({ url: URL_OK });
    expect(res.status).toBe(200);
    expect(extraction.extractRecipeFromFile).toHaveBeenCalledWith(expect.any(Uint8Array), DOCX_MIME, expect.any(Function));
    expect(standardizeExtractedRecipe).toHaveBeenCalledWith(EXTRACTED, [{ id: "p-pan", name: "Pangrattato", aliases: [] }]);
    const body = await res.json();
    expect(body.recipeIngredients).toEqual([
      { rawText: "3 ud melanzane", productId: null, qty: 3, unit: "unidad", section: null, note: null, pesoCalculoG: 300 },
      { rawText: "100 g pangrattato", productId: "p-pan", qty: 100, unit: "g", section: "Panatura", note: null, pesoCalculoG: null },
      { rawText: "olio extravergine", productId: null, qty: null, unit: null, section: "Panatura", note: "1 cucchiaio", pesoCalculoG: null },
    ]);
    expect(body.contentJson.ingredients).toEqual(["3 ud melanzane", "100 g pangrattato", "olio extravergine, 1 cucchiaio"]);
    expect(log.info).toHaveBeenCalledWith("recipe_import_gdoc", expect.objectContaining({ ingredients: 3, exactMatches: 1, section: 2 }));
  });
});
