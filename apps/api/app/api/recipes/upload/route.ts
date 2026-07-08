// Receives a PDF or DOCX upload and returns a structured recipe draft
// (title + ingredients/method/notes). Does NOT persist the recipe — the
// client shows the result, lets the user review, then calls POST /api/recipes
// to save the final version.
//
// Fase 3 del Banco: tras extraer, corremos matching contra el banco. La
// response incluye recipeIngredients (estructurado con productId pre-set
// para matches exactos) y pendingMatches (sugerencias probable que el
// cliente debe confirmar antes de guardar la receta).
//
// Routes BYOK-aware (Anthropic/OpenAI/Google) so the user's own provider is
// used for extraction when configured.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { logger } from "@/lib/logger";
import {
  extractRecipeFromFile,
  PDF_MIME,
  DOCX_MIME,
  type ExtractorBYOK,
} from "@/lib/recipe-extraction";
import { loadUserBYOK } from "@/lib/byok-user";
import { findMatch, type MatchCandidate } from "@/lib/products/matching";
import { parseIngredient } from "@/lib/products/parser";
import { reserveAiCall, aiQuotaExceededResponse } from "@/lib/ai-quota";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIMES = [PDF_MIME, DOCX_MIME];

export async function POST(req: NextRequest) {
  const ctx = await requireAuth(req, "edit_recipe");
  if (isNextResponse(ctx)) return ctx;

  const form = await req.formData();
  const file = form.get("file");
  if (!file || !(file instanceof Blob))
    return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });

  // Some clients (Expo on Android) send empty/missing mime — accept the form
  // hint from `name`'s extension as a fallback.
  const fileName = file instanceof File ? file.name : "";
  const mime = inferMime(file.type, fileName);
  if (!ALLOWED_MIMES.includes(mime))
    return NextResponse.json(
      { error: "Tipo de archivo no soportado", allowed: ALLOWED_MIMES },
      { status: 415 },
    );

  if (file.size > MAX_BYTES)
    return NextResponse.json(
      { error: "Archivo demasiado grande", max: MAX_BYTES },
      { status: 413 },
    );

  const buffer = new Uint8Array(await file.arrayBuffer());

  // loadUserBYOK descifra la clave (formato `v1:...`) y self-heala las
  // entradas legacy plaintext que pudieran quedar de antes de la encripción.
  const byok: ExtractorBYOK = await loadUserBYOK(ctx.userId);

  // Con clave del server aplica el tope diario; con BYOK (clave del chef) no.
  if (!byok) {
    const quota = await reserveAiCall(ctx.userId);
    if (!quota.ok) return aiQuotaExceededResponse(quota.retryAfter);
  }

  const start = Date.now();
  try {
    // Extracción + matching en paralelo — la extracción tarda 3-30s; mientras
    // se ejecuta, prefetcheamos el banco de productos del restaurante para
    // tener las candidatas listas y matchear sin un round-trip extra al
    // terminar el LLM.
    const [extracted, productList] = await Promise.all([
      extractRecipeFromFile(buffer, mime, byok),
      ctx.restaurantId
        ? prisma.product.findMany({
            where: {
              restaurantId: ctx.restaurantId,
              deletedAt: null,
              estado: { in: ["activo", "borrador"] },
            },
            select: { id: true, name: true, aliases: true },
          })
        : Promise.resolve([]),
    ]);

    const candidates: MatchCandidate[] = productList.map((p) => ({
      id: p.id,
      name: p.name,
      aliases: p.aliases,
    }));

    // Matcheamos cada ingrediente contra el banco. exact → productId pre-set;
    // probable → lo mandamos en pendingMatches para que el mobile pida
    // confirmación al chef; none → productId null, el mobile crea draft al
    // guardar.
    const recipeIngredients: Array<{ rawText: string; productId: string | null }> = [];
    const pendingMatches: Array<{
      ingredientIdx: number;
      productId: string;
      productName: string;
    }> = [];

    extracted.ingredients.forEach((rawText, idx) => {
      // Bug C fix (Andy 2026-05-17): parsear rawText antes de matchear
      // contra el banco. El LLM extrae líneas tipo "200g harina" — si las
      // pasamos enteras a findMatch, Levenshtein contra "harina" da
      // distance>3 y cae como "none" → se crea draft duplicado. Parseando
      // primero, matcheamos sólo el nombre limpio.
      const parsed = parseIngredient(rawText);
      const m = findMatch(parsed.name || rawText, candidates);
      if (m.level === "exact" && m.productId) {
        recipeIngredients.push({ rawText, productId: m.productId });
      } else if (m.level === "probable" && m.productId && m.productName) {
        recipeIngredients.push({ rawText, productId: null });
        pendingMatches.push({
          ingredientIdx: idx,
          productId: m.productId,
          productName: m.productName,
        });
      } else {
        recipeIngredients.push({ rawText, productId: null });
      }
    });

    logger.info("recipe_upload_extracted", {
      userId: ctx.userId,
      mime,
      bytes: file.size,
      byok: byok?.provider ?? null,
      latencyMs: Date.now() - start,
      ingredients: extracted.ingredients.length,
      exactMatches: recipeIngredients.filter((r) => r.productId !== null).length,
      probableMatches: pendingMatches.length,
    });
    return NextResponse.json({
      title: extracted.title,
      contentJson: {
        ingredients: extracted.ingredients,
        method: extracted.method,
        notes: extracted.notes ?? "",
      },
      recipeIngredients,
      pendingMatches,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al procesar archivo";
    logger.error("recipe_upload_failed", {
      userId: ctx.userId,
      mime,
      bytes: file.size,
      byok: byok?.provider ?? null,
      error: message,
    });
    return NextResponse.json({ error: message }, { status: 422 });
  }
}

function inferMime(declared: string, fileName: string): string {
  if (declared && declared !== "application/octet-stream") return declared;
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return PDF_MIME;
  if (lower.endsWith(".docx")) return DOCX_MIME;
  return declared;
}
