import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { CreateRecipeRequestSchema, type CreateRecipeRequest } from "@atelier/shared";
import { withAuth } from "@/lib/with-auth";
import { logger } from "@/lib/logger";
import { projectRecipeListItem, recipeListInclude } from "@/lib/projections";
import type { Prisma } from "@atelier/db";

export const dynamic = "force-dynamic";

export const GET = withAuth({}, async (ctx, _body, req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const state = searchParams.get("state") as "draft" | "in_test" | "approved" | null;
  const priorityParam = searchParams.get("priority");
  const q = searchParams.get("q");

  const where: Prisma.RecipeWhereInput = { restaurantId: ctx.restaurantId, deletedAt: null };
  if (state) where.state = state;
  if (priorityParam === "true") where.priority = true;
  if (q) where.title = { contains: q, mode: "insensitive" };

  const recipes = await prisma.recipe.findMany({
    where,
    orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
    include: recipeListInclude,
    take: 200,
  });

  return NextResponse.json(recipes.map(projectRecipeListItem));
});

export const POST = withAuth(
  { permission: "edit_recipe", body: CreateRecipeRequestSchema },
  async (ctx, body: CreateRecipeRequest) => {
    const recipe = await prisma.recipe.create({
      data: {
        title: body.title,
        contentJson: body.contentJson,
        restaurantId: ctx.restaurantId,
        authorId: ctx.userId,
        sourceConversationId: body.sourceConversationId ?? null,
        state: "draft",
        priority: false,
        version: 1,
      },
      include: recipeListInclude,
    });

    logger.info("recipe_created", {
      recipeId: recipe.id,
      restaurantId: ctx.restaurantId,
      userId: ctx.userId,
    });

    return NextResponse.json(projectRecipeListItem(recipe), { status: 201 });
  },
);
