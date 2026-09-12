import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { CreateRecipeRequestSchema, type CreateRecipeRequest } from "@atelier/shared";
import { withAuth } from "@/lib/with-auth";
import { logger } from "@/lib/logger";
import { projectRecipeListItem, recipeListInclude } from "@/lib/projections";
import { saveNewRecipe } from "@/lib/create-recipe";
import { RecipeSaveError } from "@/lib/products/recipe-save";
import type { Prisma } from "@atelier/db";

export const dynamic = "force-dynamic";

export const GET = withAuth({ permission: "view_staff_recipe" }, async (ctx, _body, req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const state = searchParams.get("state") as "draft" | "in_test" | "approved" | null;
  const priorityParam = searchParams.get("priority");
  const q = searchParams.get("q");
  // Papelera: ?trash=true lista las recetas borradas (soft-delete) para poder
  // restaurarlas. El listado normal excluye las borradas.
  const trash = searchParams.get("trash") === "true";

  const where: Prisma.RecipeWhereInput = {
    restaurantId: ctx.restaurantId,
    deletedAt: trash ? { not: null } : null,
  };
  if (state) where.state = state;
  if (priorityParam === "true") where.priority = true;
  if (q) where.title = { contains: q, mode: "insensitive" };

  const recipes = await prisma.recipe.findMany({
    where,
    orderBy: trash ? [{ deletedAt: "desc" }] : [{ priority: "desc" }, { updatedAt: "desc" }],
    include: recipeListInclude,
    take: 200,
  });

  return NextResponse.json(recipes.map(projectRecipeListItem));
});

export const POST = withAuth(
  { permission: "edit_recipe", body: CreateRecipeRequestSchema },
  async (ctx, body: CreateRecipeRequest) => {
    try {
      const { recipe, reused } = await saveNewRecipe(ctx.restaurantId, ctx.userId, body);
      logger.info("recipe_saved", { recipeId: recipe.id, restaurantId: ctx.restaurantId, reused });
      return NextResponse.json(projectRecipeListItem(recipe), { status: reused ? 200 : 201 });
    } catch (error) {
      if (error instanceof RecipeSaveError) return NextResponse.json({ error: error.code, code: error.code }, { status: error.status });
      throw error;
    }
  },
);
