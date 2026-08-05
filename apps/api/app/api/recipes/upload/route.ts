// Receives a PDF or DOCX upload and returns a structured recipe draft
// (title + ingredients/method/notes). Does NOT persist the recipe — the
// client shows the result, lets the user review, then calls POST /api/recipes
// to save the final version.
//
// Fase 3 del Banco: tras extraer, corremos matching contra el banco. La
// response incluye recipeIngredients (estructurado con productId pre-set
// para matches exactos) y pendingMatches (sugerencias probable que el
// cliente debe confirmar antes de guardar la receta).

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { logger } from "@/lib/logger";
import {
  extractRecipeFromFile,
  extractRecipeFromImage,
  fileMatchesMime,
  PDF_MIME,
  DOCX_MIME,
  IMAGE_MIMES,
} from "@/lib/recipe-extraction";
import { type MatchCandidate } from "@/lib/products/matching";
import {
  matchIngredientList,
  MATCH_CANDIDATE_SELECT,
} from "@/lib/products/match-ingredients";
import { reserveAiCall, aiQuotaExceededResponse } from "@/lib/ai-quota";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIMES = [PDF_MIME, DOCX_MIME, ...IMAGE_MIMES];

export async function POST(req: NextRequest) {
  const ctx = await requireAuth(req, "edit_recipe");
  if (isNextResponse(ctx)) return ctx;

  const form = await req.formData();
  const file = form.get("file");
  if (!file || !(file instanceof Blob))
    return NextResponse.json(
      { error: "Falta el archivo", code: "file_invalid" },
      { status: 400 },
    );

  // Some clients (Expo on Android) send empty/missing mime — accept the form
  // hint from `name`'s extension as a fallback.
  const fileName = file instanceof File ? file.name : "";
  const mime = inferMime(file.type, fileName);
  if (!ALLOWED_MIMES.includes(mime))
    return NextResponse.json(
      { error: "Tipo de archivo no soportado", allowed: ALLOWED_MIMES, code: "file_invalid" },
      { status: 415 },
    );

  const isImage = (IMAGE_MIMES as readonly string[]).includes(mime);

  // Las fotos pesan más por píxel de contenido útil: tope más bajo (6 MB) para
  // que el base64 + la request al modelo de visión no se disparen.
  const max = isImage ? 6 * 1024 * 1024 : MAX_BYTES;
  if (file.size > max)
    return NextResponse.json(
      { error: "Archivo demasiado grande", max, code: "file_invalid" },
      { status: 413 },
    );

  const buffer = new Uint8Array(await file.arrayBuffer());

  // El contenido real debe coincidir con el MIME declarado (el cliente puede
  // mentir). Evita alimentar basura/archivos disfrazados al parser.
  if (!fileMatchesMime(buffer, mime))
    return NextResponse.json(
      { error: "El archivo no coincide con su tipo", allowed: ALLOWED_MIMES, code: "file_invalid" },
      { status: 415 },
    );

  const quota = await reserveAiCall(ctx.userId);
  if (!quota.ok) return aiQuotaExceededResponse(quota.retryAfter);

  const start = Date.now();
  try {
    // Extracción + matching en paralelo — la extracción tarda 3-30s; mientras
    // se ejecuta, prefetcheamos el banco de productos del restaurante para
    // tener las candidatas listas y matchear sin un round-trip extra al
    // terminar el LLM.
    const [extracted, productList] = await Promise.all([
      isImage
        ? extractRecipeFromImage(buffer, mime)
        : extractRecipeFromFile(buffer, mime),
      ctx.restaurantId
        ? prisma.product.findMany({
            where: {
              restaurantId: ctx.restaurantId,
              deletedAt: null,
              estado: { in: ["activo", "borrador"] },
            },
            select: MATCH_CANDIDATE_SELECT,
          })
        : Promise.resolve([]),
    ]);

    const candidates: MatchCandidate[] = productList.map((p) => ({
      id: p.id,
      name: p.name,
      aliases: p.aliases,
      precioCompra: p.precioCompra,
      unidadCompra: p.unidadCompra,
    }));

    const { recipeIngredients, pendingMatches, ambiguousMatches } =
      matchIngredientList(extracted.ingredients, candidates);

    logger.info("recipe_upload_extracted", {
      userId: ctx.userId,
      mime,
      bytes: file.size,
      latencyMs: Date.now() - start,
      ingredients: extracted.ingredients.length,
      exactMatches: recipeIngredients.filter((r) => r.productId !== null).length,
      probableMatches: pendingMatches.length,
      ambiguousMatches: ambiguousMatches.length,
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
      ambiguousMatches,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al procesar archivo";
    logger.error("recipe_upload_failed", {
      userId: ctx.userId,
      mime,
      bytes: file.size,
      error: message,
    });
    return NextResponse.json(
      { error: message, code: "recipe_extraction_failed" },
      { status: 422 },
    );
  }
}

function inferMime(declared: string, fileName: string): string {
  if (declared && declared !== "application/octet-stream") return declared;
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return PDF_MIME;
  if (lower.endsWith(".docx")) return DOCX_MIME;
  return declared;
}
