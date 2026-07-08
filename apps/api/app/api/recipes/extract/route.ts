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
// Usa SIEMPRE la clave del server (extractRecipeFromText), no BYOK: la
// extracción es infraestructura de la app (decisión A-01), no el servicio
// personal del chef.
//
// El bloque de matching está duplicado del upload route a propósito: son
// ~25 líneas, evita tocar el path PDF de producción y mantener una
// abstracción prematura compartida (CLAUDE.md #3/#7).

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { ExtractRecipeRequestSchema } from "@atelier/shared";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { logger } from "@/lib/logger";
import { extractRecipeFromText } from "@/lib/recipe-extraction";
import { findMatch, type MatchCandidate } from "@/lib/products/matching";
import { parseIngredient } from "@/lib/products/parser";
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
            select: { id: true, name: true, aliases: true },
          })
        : Promise.resolve([]),
    ]);

    const candidates: MatchCandidate[] = productList.map((p) => ({
      id: p.id,
      name: p.name,
      aliases: p.aliases,
    }));

    const recipeIngredients: Array<{
      rawText: string;
      productId: string | null;
    }> = [];
    const pendingMatches: Array<{
      ingredientIdx: number;
      productId: string;
      productName: string;
    }> = [];

    extracted.ingredients.forEach((rawText, idx) => {
      // Parsear antes de matchear (Bug C fix, igual que el upload route):
      // "200g harina" → matchear sólo "harina" contra el banco.
      const p = parseIngredient(rawText);
      const m = findMatch(p.name || rawText, candidates);
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

    logger.info("recipe_extract_from_text", {
      userId: ctx.userId,
      latencyMs: Date.now() - start,
      chars: parsed.data.text.length,
      ingredients: extracted.ingredients.length,
      exactMatches: recipeIngredients.filter((r) => r.productId !== null)
        .length,
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
