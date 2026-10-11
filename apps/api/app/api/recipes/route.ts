import { after, NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { CreateRecipeRequestSchema, type CreateRecipeRequest } from "@atelier/shared";
import { withAuth } from "@/lib/with-auth";
import { logger } from "@/lib/logger";
import { projectRecipeListItem, recipeListInclude } from "@/lib/projections";
import { saveNewRecipe } from "@/lib/create-recipe";
import { RecipeSaveError } from "@/lib/products/recipe-save";
import { learnAfterImport } from "@/lib/culinary-memory/worker";
import { generateMemory, memoryProviderConfig } from "@/lib/culinary-memory/provider";
import { MINIMUM_ROW_TIME_MS } from "@/lib/culinary-memory/scheduling";
import type { Prisma } from "@atelier/db";

export const dynamic = "force-dynamic";
// The after() run counts toward this limit: one row's deadline
// (MINIMUM_ROW_TIME_MS, 60 s) plus 30 s for the request and the final writes.
export const maxDuration = 90;

/**
 * An imported recipe in testing or approved teaches the memory right away, without
 * waiting for the weekly cron. The response does not wait for it.
 */
function learnFromImport(restaurantId: string, config: { model: string; provider: string }) {
  const signal = AbortSignal.timeout(MINIMUM_ROW_TIME_MS);
  after(async () => {
    try { logger.info("culinary_memory_import_run", { restaurantId, result: await learnAfterImport(restaurantId, { generator: generateMemory, config, signal }) }); }
    catch (error) { logger.error("culinary_memory_import_run_failed", { restaurantId, error, message: error instanceof Error ? error.message : String(error) }); }
  });
}

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
      const { recipe, reused } = await saveNewRecipe(ctx.restaurantId, ctx.userId, body, ctx.role);
      logger.info("recipe_saved", { recipeId: recipe.id, restaurantId: ctx.restaurantId, reused });
      const learns = !reused && body.origin === "import" && (recipe.state === "approved" || recipe.state === "in_test");
      const config = learns ? memoryProviderConfig() : null;
      if (config) learnFromImport(ctx.restaurantId, config);
      return NextResponse.json(projectRecipeListItem(recipe), { status: reused ? 200 : 201 });
    } catch (error) {
      if (error instanceof RecipeSaveError) return NextResponse.json({ error: error.code, code: error.code }, { status: error.status });
      throw error;
    }
  },
);
