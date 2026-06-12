import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { CreateRecipeRequestSchema, type CreateRecipeRequest } from "@atelier/shared";
import { withAuth } from "@/lib/with-auth";
import { logger } from "@/lib/logger";
import { projectRecipeListItem, recipeListInclude } from "@/lib/projections";
import { parseIngredient } from "@/lib/products/parser";
import type { Prisma } from "@atelier/db";

// Sub-paso 6 — fix unificado: el cliente puede mandar `recipeIngredients`
// con `rawText` solo (sin qty/unit/pezzatura), y el server completa esos
// campos parseando el rawText. Si el cliente ya manda qty/unit/pezzatura,
// los respeta tal como vienen.
function autoEnrich(ing: {
  rawText: string;
  qty?: number | null;
  unit?: string | null;
  pezzatura?: string | null;
}): { qty: number | null; unit: string | null; pezzatura: string | null } {
  // Si el cliente envió algo explícito (incluso null), lo respeto.
  const hasQty = ing.qty !== undefined && ing.qty !== null;
  const hasUnit = ing.unit !== undefined && ing.unit !== null;
  if (hasQty && hasUnit) {
    return {
      qty: ing.qty ?? null,
      unit: ing.unit ?? null,
      pezzatura: ing.pezzatura ?? null,
    };
  }
  const parsed = parseIngredient(ing.rawText);
  return {
    qty: hasQty ? (ing.qty ?? null) : parsed.quantity,
    unit: hasUnit ? (ing.unit ?? null) : parsed.unit,
    pezzatura: ing.pezzatura ?? null,
  };
}

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

// La nota (Idea) que originó la conversación queda consumida cuando el chef
// la vuelve receta: la archivamos para que salga de la lista de Inicio.
// Best-effort fuera de la transacción de la receta: si esto falla, la receta
// ya está guardada (lo importante) y la nota solo queda visible de más.
async function archiveSourceIdea(
  sourceConversationId: string | null | undefined,
  restaurantId: string,
): Promise<void> {
  if (!sourceConversationId) return;
  try {
    const conv = await prisma.conversation.findFirst({
      where: { id: sourceConversationId, restaurantId },
      select: { ideaId: true },
    });
    if (!conv?.ideaId) return;
    await prisma.idea.updateMany({
      where: { id: conv.ideaId, restaurantId, status: { not: "archived" } },
      data: { status: "archived" },
    });
  } catch (err) {
    logger.error("idea_archive_failed", {
      sourceConversationId,
      restaurantId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

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
          data: body.recipeIngredients!.map((ing, idx) => {
            const enriched = autoEnrich(ing);
            return {
              recipeId: created.id,
              productId: ing.productId ?? null,
              position: idx,
              rawText: ing.rawText,
              qty: enriched.qty,
              unit: enriched.unit,
              pezzatura: enriched.pezzatura,
              mermaOverridePct: ing.mermaOverridePct ?? null,
              // Entrega A.5, Fase 7 — override del peso por pieza.
              pesoCalculoG: ing.pesoCalculoG ?? null,
            };
          }),
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

      await archiveSourceIdea(body.sourceConversationId, ctx.restaurantId);

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

    await archiveSourceIdea(body.sourceConversationId, ctx.restaurantId);

    return NextResponse.json(projectRecipeListItem(recipe), { status: 201 });
  },
);
