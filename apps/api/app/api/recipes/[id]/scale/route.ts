// Escalar porciones (auditoría jul 2026): crea una COPIA (draft) de la receta
// con las cantidades de ingredientes reajustadas por el factor
// toPortions/fromPortions. No pisa la original. El método/notas NO se escalan
// (ver scaleIngredientLine). Reusa el mismo patrón que duplicate.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import type { Prisma } from "@atelier/db";
import { ScaleRecipeRequestSchema, scaleIngredientLine } from "@atelier/shared";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { logger } from "@/lib/logger";
import { projectRecipeDetail, recipeDetailInclude } from "@/lib/projections";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth(req, "edit_recipe");
  if (isNextResponse(ctx)) return ctx;
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = ScaleRecipeRequestSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Porciones inválidas" }, { status: 400 });

  const { fromPortions, toPortions } = parsed.data;
  const factor = toPortions / fromPortions;

  const source = await prisma.recipe.findUnique({
    where: { id },
    include: { recipeIngredients: { orderBy: { position: "asc" } } },
  });
  if (!source || source.restaurantId !== ctx.restaurantId || source.deletedAt !== null)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Escalar solo el array de ingredientes del contentJson (texto libre). El
  // método y las notas quedan intactos a propósito.
  const content = (source.contentJson ?? {}) as {
    ingredients?: string[];
    method?: string[];
    notes?: string;
  };
  const scaledContent = {
    ...content,
    ingredients: (content.ingredients ?? []).map((line) =>
      scaleIngredientLine(line, factor),
    ),
  };

  const copy = await prisma.$transaction(async (tx) => {
    const created = await tx.recipe.create({
      data: {
        restaurantId: ctx.restaurantId,
        authorId: ctx.userId,
        title: `${source.title} (${toPortions} porc.)`,
        contentJson: scaledContent as Prisma.InputJsonValue,
        portions: toPortions,
        salePrice: source.salePrice,
        manualAllergens: source.manualAllergens,
        state: "draft",
        priority: false,
        version: 1,
      },
    });
    if (source.recipeIngredients.length > 0) {
      await tx.recipeIngredient.createMany({
        data: source.recipeIngredients.map((ing) => ({
          recipeId: created.id,
          productId: ing.productId,
          position: ing.position,
          rawText: scaleIngredientLine(ing.rawText, factor),
          // qty estructurada escalada (Decimal(10,3)); null se mantiene null.
          qty: ing.qty === null ? null : Math.round(Number(ing.qty) * factor * 1000) / 1000,
          unit: ing.unit,
          pezzatura: ing.pezzatura,
          mermaOverridePct: ing.mermaOverridePct,
          pesoCalculoG: ing.pesoCalculoG,
        })),
      });
    }
    return tx.recipe.findUnique({ where: { id: created.id }, include: recipeDetailInclude });
  });

  if (!copy) throw new Error("recipe_scale_lost");

  logger.info("recipe_scaled", {
    sourceId: id,
    newId: copy.id,
    restaurantId: ctx.restaurantId,
    userId: ctx.userId,
    fromPortions,
    toPortions,
  });

  return NextResponse.json(projectRecipeDetail(copy), { status: 201 });
}
