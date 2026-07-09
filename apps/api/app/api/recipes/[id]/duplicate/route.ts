// Duplicar una receta como borrador nuevo (auditoría jul 2026): editar una
// receta aprobada la pisa; duplicar deja hacer variantes sin tocar la original.
// La copia nace SIEMPRE como draft v1 (sin aprobación, sin prioridad, sin
// idea de origen), con "(copia)" en el título, y clona los ingredientes tal
// cual (mismos productos enlazados, cantidades, pezzatura, overrides).

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import type { Prisma } from "@atelier/db";
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

  const source = await prisma.recipe.findUnique({
    where: { id },
    include: { recipeIngredients: { orderBy: { position: "asc" } } },
  });
  if (!source || source.restaurantId !== ctx.restaurantId || source.deletedAt !== null)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const copy = await prisma.$transaction(async (tx) => {
    const created = await tx.recipe.create({
      data: {
        restaurantId: ctx.restaurantId,
        authorId: ctx.userId,
        title: `${source.title} (copia)`,
        contentJson: (source.contentJson ?? {}) as Prisma.InputJsonValue,
        portions: source.portions,
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
          rawText: ing.rawText,
          qty: ing.qty,
          unit: ing.unit,
          pezzatura: ing.pezzatura,
          mermaOverridePct: ing.mermaOverridePct,
          pesoCalculoG: ing.pesoCalculoG,
        })),
      });
    }
    return tx.recipe.findUnique({ where: { id: created.id }, include: recipeDetailInclude });
  });

  if (!copy) throw new Error("recipe_duplicate_lost");

  logger.info("recipe_duplicated", {
    sourceId: id,
    newId: copy.id,
    restaurantId: ctx.restaurantId,
    userId: ctx.userId,
    ingredients: source.recipeIngredients.length,
  });

  return NextResponse.json(projectRecipeDetail(copy), { status: 201 });
}
