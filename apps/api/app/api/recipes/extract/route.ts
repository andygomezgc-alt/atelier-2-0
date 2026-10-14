// A-01 Opción A — extracción desacoplada del chat.
//
// El Asistente, al "Guardar como receta", manda acá el texto visible de la
// receta (ya sin <recipe_payload>). Estructuramos con GLM + JSON validado, corremos el MISMO matching contra el
// banco que el upload de PDF, y devolvemos la MISMA shape
// (ExtractedRecipeResponse) — así el formulario de revisión /recetas/nueva
// lo consume igual que el flujo PDF. NO persiste la receta: el chef revisa
// y luego POST /api/recipes.
//
// Usa la clave GLM del server (extractRecipeFromText): la extracción
// es infraestructura de la app (decisión A-01).
//
// Standard format and bank matching live in lib/recipes/extraction-pipeline,
// shared with /upload and /import-gdoc.

import { NextRequest, NextResponse } from "next/server";
import { ExtractRecipeRequestSchema } from "@atelier/shared";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { logger } from "@/lib/logger";
import { extractRecipeFromText } from "@/lib/recipe-extraction";
import { loadMatchCandidates, standardizeExtractedRecipe } from "@/lib/recipes/extraction-pipeline";
import { reserveAiCall, aiQuotaExceededResponse, recordAiTokens } from "@/lib/ai-quota";
import { budgetErrorResponse } from "@/lib/ai/budget-policy";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const ctx = await requireAuth(req, "edit_recipe");
  if (isNextResponse(ctx)) return ctx;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = ExtractRecipeRequestSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "Texto de receta requerido" },
      { status: 400 },
    );

  // Extracción usa SIEMPRE la clave del server → tope diario por usuario.
  const quota = await reserveAiCall(ctx.userId);
  if (!quota.ok) return aiQuotaExceededResponse(quota.retryAfter);

  const start = Date.now();
  try {
    const [extracted, candidates] = await Promise.all([
      extractRecipeFromText(parsed.data.text, usage => recordAiTokens(ctx.userId, usage.inputTokens, usage.outputTokens).catch(() => undefined)),
      loadMatchCandidates(ctx.restaurantId),
    ]);
    const { response, stats } = standardizeExtractedRecipe(extracted, candidates);

    logger.info("recipe_extract_from_text", {
      userId: ctx.userId,
      latencyMs: Date.now() - start,
      chars: parsed.data.text.length,
      ...stats,
      exactMatches: response.recipeIngredients.filter((r) => r.productId !== null).length,
      probableMatches: response.pendingMatches.length,
    });

    return NextResponse.json(response);
  } catch (err) {
    const budgetResponse = budgetErrorResponse(err);
    if (budgetResponse) return budgetResponse;
    const message =
      err instanceof Error ? err.message : "Error al estructurar la receta";
    logger.error("recipe_extract_failed", {
      userId: ctx.userId,
      chars: parsed.data.text.length,
      error: message,
    });
    return NextResponse.json(
      { error: message, code: "recipe_extraction_failed" },
      { status: 422 },
    );
  }
}
