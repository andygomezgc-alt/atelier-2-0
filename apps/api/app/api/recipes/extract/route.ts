// A-01 Opción A — extracción desacoplada del chat.
//
// El Asistente, al "Guardar como receta", manda acá el texto visible de la
// receta (ya sin <recipe_payload>). Estructuramos con Haiku + tool use
// forzado (garantía técnica de JSON), corremos el MISMO matching contra el
// banco que el upload de PDF, y devolvemos la MISMA shape
// (ExtractedRecipeResponse) — así el formulario de revisión /recetas/nueva
// lo consume igual que el flujo PDF. NO persiste la receta: el chef revisa
// y luego POST /api/recipes.
//
// Usa la clave Anthropic del server (extractRecipeFromText): la extracción
// es infraestructura de la app (decisión A-01).
//
// El bloque de matching estuvo duplicado del upload route mientras fueron
// ~25 líneas estables. Al sumar el nivel "ambiguo" (jul 2026) había que
// tocar las tres copias igual, así que pasó a lib/products/match-ingredients.ts.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { ExtractRecipeRequestSchema } from "@atelier/shared";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { logger } from "@/lib/logger";
import { extractRecipeFromText } from "@/lib/recipe-extraction";
import { type MatchCandidate } from "@/lib/products/matching";
import {
  matchIngredientList,
  MATCH_CANDIDATE_SELECT,
} from "@/lib/products/match-ingredients";
import { reserveAiCall, aiQuotaExceededResponse } from "@/lib/ai-quota";

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
    const [extracted, productList] = await Promise.all([
      extractRecipeFromText(parsed.data.text),
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

    logger.info("recipe_extract_from_text", {
      userId: ctx.userId,
      latencyMs: Date.now() - start,
      chars: parsed.data.text.length,
      ingredients: extracted.ingredients.length,
      exactMatches: recipeIngredients.filter((r) => r.productId !== null)
        .length,
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
