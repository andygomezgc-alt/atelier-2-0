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
    // Si vienen ingredientes estructurados (Fase 2 del Banco), creamos la
    // receta + las filas RecipeIngredient en una sola transacción.
    // Validamos antes que los productIds referenciados pertenezcan al
    // restaurante (anti-IDOR).
    if (body.recipeIngredients && body.recipeIngredients.length > 0) {
      const productIds = body.recipeIngredients
        .map((i) => i.productId)
        .filter((id): id is string => typeof id === "string" && id.length > 0);

      if (productIds.length > 0) {
        const count = await prisma.product.count({
          where: {
            id: { in: productIds },
            restaurantId: ctx.restaurantId,
            deletedAt: null,
          },
        });
        if (count !== new Set(productIds).size) {
          return NextResponse.json(
            { error: "invalid_product_reference" },
            { status: 400 },
          );
        }
      }

      const recipe = await prisma.$transaction(async (tx) => {
        const created = await tx.recipe.create({
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
        });
        await tx.recipeIngredient.createMany({
          data: body.recipeIngredients!.map((ing, idx) => ({
            recipeId: created.id,
            productId: ing.productId ?? null,
            position: idx,
            rawText: ing.rawText,
            qty: ing.qty ?? null,
            unit: ing.unit ?? null,
            pezzatura: ing.pezzatura ?? null,
            mermaOverridePct: ing.mermaOverridePct ?? null,
          })),
        });
        return tx.recipe.findUnique({ where: { id: created.id }, include: recipeListInclude });
      });

      if (!recipe) throw new Error("recipe_create_lost");

      logger.info("recipe_created", {
        recipeId: recipe.id,
        restaurantId: ctx.restaurantId,
        userId: ctx.userId,
        structuredIngredients: body.recipeIngredients.length,
        linkedProducts: productIds.length,
      });

      return NextResponse.json(projectRecipeListItem(recipe), { status: 201 });
    }

    // Path legacy — sin ingredientes estructurados.
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
