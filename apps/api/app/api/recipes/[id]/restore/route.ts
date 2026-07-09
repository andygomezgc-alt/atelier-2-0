// Restaurar una receta desde la papelera (auditoría jul 2026): el borrado es
// soft (deletedAt), así que "restaurar" solo lo limpia. Vuelve con su estado
// original (draft/in_test/approved), no se re-crea nada.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
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

  const existing = await prisma.recipe.findUnique({
    where: { id },
    select: { id: true, restaurantId: true, deletedAt: true },
  });
  // Anti-IDOR + solo tiene sentido restaurar algo que está en la papelera.
  if (!existing || existing.restaurantId !== ctx.restaurantId || existing.deletedAt === null)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.recipe.update({ where: { id }, data: { deletedAt: null } });
  const restored = await prisma.recipe.findUnique({ where: { id }, include: recipeDetailInclude });
  if (!restored) throw new Error("recipe_restore_lost");

  logger.info("recipe_restored", { recipeId: id, restaurantId: ctx.restaurantId, userId: ctx.userId });

  return NextResponse.json(projectRecipeDetail(restored));
}
