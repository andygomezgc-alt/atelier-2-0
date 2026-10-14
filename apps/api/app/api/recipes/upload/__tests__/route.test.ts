import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const { db, guard, quota, extraction, log } = vi.hoisted(() => ({
  db: { product: { findMany: vi.fn() } },
  guard: { requireAuth: vi.fn() },
  quota: { reserveAiCall: vi.fn(), recordAiTokens: vi.fn() },
  extraction: { extractRecipeFromFile: vi.fn(), extractRecipeFromImage: vi.fn() },
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
// fileMatchesMime and the MIME constants stay real.
vi.mock("@/lib/recipe-extraction", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/recipe-extraction")>()),
  extractRecipeFromFile: extraction.extractRecipeFromFile,
  extractRecipeFromImage: extraction.extractRecipeFromImage,
}));
vi.mock("@/lib/recipes/extraction-pipeline", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/recipes/extraction-pipeline")>();
  return { ...actual, standardizeExtractedRecipe: vi.fn(actual.standardizeExtractedRecipe) };
});

import { AiBudgetError } from "@/lib/ai/budget-policy";
import { DOCX_MIME, PDF_MIME } from "@/lib/recipe-extraction";
import { standardizeExtractedRecipe } from "@/lib/recipes/extraction-pipeline";
import { POST } from "../route";

const CTX = { userId: "u1", role: "chef", restaurantId: "rest-1" };
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10];
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31];
const DOCX = [0x50, 0x4b, 0x03, 0x04, 0x14, 0x00];
const EXTRACTED = {
  title: "Albóndigas en salsa",
  portions: 6,
  ingredients: [
    { section: null, qty: 600, unit: "g", name: "carne picada de ternera", note: null, pieceWeightG: null },
    { section: null, qty: "2-3", unit: "unidad", name: "dientes de ajo", note: "picados", pieceWeightG: null },
    { section: "Salsa", qty: 20, unit: "cl", name: "vino blanco", note: null, pieceWeightG: null },
    { section: "Salsa", qty: 1, unit: "cucharada", name: "harina", note: null, pieceWeightG: null },
  ],
  method: ["Forma las albóndigas."],
  notes: "",
};

function upload(bytes: number[] | null, type: string, name = "receta") {
  const form = new FormData();
  if (bytes) form.append("file", new File([new Uint8Array(bytes)], name, { type }));
  return POST(new NextRequest("https://test.local/api/recipes/upload", { method: "POST", body: form }));
}

beforeEach(() => {
  vi.clearAllMocks();
  guard.requireAuth.mockResolvedValue(CTX);
  quota.reserveAiCall.mockResolvedValue({ ok: true });
  quota.recordAiTokens.mockResolvedValue(undefined);
  db.product.findMany.mockResolvedValue([{ id: "p-vino", name: "Vino blanco", aliases: [] }]);
  extraction.extractRecipeFromFile.mockResolvedValue(EXTRACTED);
  extraction.extractRecipeFromImage.mockResolvedValue(EXTRACTED);
});

describe("POST /api/recipes/upload", () => {
  it("requires the edit_recipe permission and returns the guard's response", async () => {
    guard.requireAuth.mockResolvedValue(NextResponse.json({ error: "No autorizado" }, { status: 403 }));
    const res = await upload(JPEG, "image/jpeg");
    expect(res.status).toBe(403);
    expect(guard.requireAuth).toHaveBeenCalledWith(expect.any(NextRequest), "edit_recipe");
    expect(extraction.extractRecipeFromImage).not.toHaveBeenCalled();
  });

  it("validates the file before spending AI quota", async () => {
    expect((await upload(null, "")).status).toBe(400);
    expect((await upload([1, 2, 3, 4], "text/plain")).status).toBe(415);
    const mismatch = await upload([1, 2, 3, 4], "image/jpeg");
    expect(mismatch.status).toBe(415);
    expect(await mismatch.json()).toMatchObject({ code: "file_invalid" });
    expect(quota.reserveAiCall).not.toHaveBeenCalled();
  });

  it("stops at the daily AI quota", async () => {
    quota.reserveAiCall.mockResolvedValue({ ok: false, retryAfter: 60 });
    expect((await upload(JPEG, "image/jpeg")).status).toBe(429);
    expect(extraction.extractRecipeFromImage).not.toHaveBeenCalled();
  });

  it("photos go to the image extraction, PDF and DOCX to the file extraction", async () => {
    await upload(JPEG, "image/jpeg");
    expect(extraction.extractRecipeFromImage).toHaveBeenCalledWith(expect.any(Uint8Array), "image/jpeg", expect.any(Function));
    expect(extraction.extractRecipeFromFile).not.toHaveBeenCalled();

    await upload(PDF, "application/pdf");
    expect(extraction.extractRecipeFromFile).toHaveBeenLastCalledWith(expect.any(Uint8Array), PDF_MIME, expect.any(Function));

    await upload(DOCX, "", "receta.docx");
    expect(extraction.extractRecipeFromFile).toHaveBeenLastCalledWith(expect.any(Uint8Array), DOCX_MIME, expect.any(Function));
    expect(extraction.extractRecipeFromImage).toHaveBeenCalledTimes(1);
  });

  it("maps an exhausted AI budget and extraction failures as before", async () => {
    extraction.extractRecipeFromImage.mockRejectedValueOnce(new AiBudgetError("ai_budget_unavailable", 5));
    expect((await upload(JPEG, "image/jpeg")).status).toBe(503);

    extraction.extractRecipeFromImage.mockRejectedValueOnce(new Error("ai_response_invalid"));
    const res = await upload(JPEG, "image/jpeg");
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "ai_response_invalid", code: "recipe_extraction_failed" });
    expect(log.error).toHaveBeenCalledWith("recipe_upload_failed", expect.objectContaining({ mime: "image/jpeg" }));
  });

  it("runs the extraction through the shared pipeline: sections, notes and canonical lines", async () => {
    const res = await upload(PDF, "application/pdf");
    expect(res.status).toBe(200);
    expect(standardizeExtractedRecipe).toHaveBeenCalledWith(EXTRACTED, [{ id: "p-vino", name: "Vino blanco", aliases: [] }]);
    const body = await res.json();
    expect(body.recipeIngredients).toEqual([
      { rawText: "600 g carne picada de ternera", productId: null, qty: 600, unit: "g", section: null, note: null, pesoCalculoG: null },
      { rawText: "3 ud diente de ajo", productId: null, qty: 3, unit: "unidad", section: null, note: "2-3, picados", pesoCalculoG: null },
      { rawText: "200 ml vino blanco", productId: "p-vino", qty: 200, unit: "ml", section: "Salsa", note: null, pesoCalculoG: null },
      { rawText: "harina", productId: null, qty: null, unit: null, section: "Salsa", note: "1 cucharada", pesoCalculoG: null },
    ]);
    expect(body.contentJson.ingredients).toEqual(["600 g carne picada de ternera", "3 ud diente de ajo, 2-3, picados", "200 ml vino blanco", "harina, 1 cucharada"]);
    expect(body.pendingMatches).toEqual([]);
    expect(log.info).toHaveBeenCalledWith("recipe_upload_extracted", expect.objectContaining({ mime: PDF_MIME, ingredients: 4, exactMatches: 1, unmeasured: 1 }));
  });
});
