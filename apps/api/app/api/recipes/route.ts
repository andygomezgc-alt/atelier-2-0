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
import { IMPORT_DEADLINE_MS } from "@/lib/culinary-memory/scheduling";
import type { Prisma } from "@atelier/db";

export const dynamic = "force-dynamic";
// The after() run counts toward this limit: it ends by IMPORT_DEADLINE_MS (270 s) after the
// request started, leaving 30 s for the final writes.
export const maxDuration = 300;

/**
 * An imported recipe in testing or approved teaches the memory without waiting for the weekly
 * cron, once imports have been quiet for a while. The response does not wait for it.
 */
function learnFromImport(restaurantId: string, config: { model: string; provider: string }, ticket: number, startedAt: number) {
  const deadline = startedAt + IMPORT_DEADLINE_MS;
  after(async () => {
    try {
      const result = await learnAfterImport(restaurantId, { generator: generateMemory, config, ticket, deadline });
      logger.info("culinary_memory_import_run", { restaurantId, result, elapsedMs: Date.now() - startedAt });
    } catch (error) {
      logger.error("culinary_memory_import_run_failed", { restaurantId, error, message: error instanceof Error ? error.message : String(error), elapsedMs: Date.now() - startedAt });
    }
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
    // The import run's deadline counts from here, not from the end of a slow save.
    const startedAt = Date.now();
    try {
      const { recipe, reused, importTicket } = await saveNewRecipe(ctx.restaurantId, ctx.userId, body, ctx.role);
      logger.info("recipe_saved", { recipeId: recipe.id, restaurantId: ctx.restaurantId, reused });
      // No ticket means nothing to learn: the memory is off or has no row.
      const learns = !reused && importTicket !== null && body.origin === "import" && (recipe.state === "approved" || recipe.state === "in_test");
      const config = learns ? memoryProviderConfig() : null;
      if (config && importTicket !== null) learnFromImport(ctx.restaurantId, config, importTicket, startedAt);
      return NextResponse.json(projectRecipeListItem(recipe), { status: reused ? 200 : 201 });
    } catch (error) {
      if (error instanceof RecipeSaveError) return NextResponse.json({ error: error.code, code: error.code }, { status: error.status });
      throw error;
    }
  },
);
