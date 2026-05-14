import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { PatchRecipeRequestSchema, can } from "@atelier/shared";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { logger } from "@/lib/logger";
import { projectRecipeDetail, recipeDetailInclude } from "@/lib/projections";
import type { Prisma } from "@atelier/db";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth(req);
  if (isNextResponse(ctx)) return ctx;
  if (!ctx.restaurantId)
    return NextResponse.json({ error: "Not in a restaurant" }, { status: 403 });
  const { id } = await params;

  const recipe = await prisma.recipe.findUnique({
    where: { id },
    include: recipeDetailInclude,
  });

  if (!recipe || recipe.restaurantId !== ctx.restaurantId || recipe.deletedAt !== null)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(projectRecipeDetail(recipe));
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth(req);
  if (isNextResponse(ctx)) return ctx;
  if (!ctx.restaurantId)
    return NextResponse.json({ error: "Not in a restaurant" }, { status: 403 });
  const { id } = await params;

  const body = await req.json();
  const parse = PatchRecipeRequestSchema.safeParse(body);
  if (!parse.success)
    return NextResponse.json({ error: parse.error.flatten() }, { status: 400 });

  const existing = await prisma.recipe.findUnique({ where: { id } });
  if (!existing || existing.restaurantId !== ctx.restaurantId || existing.deletedAt !== null)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Permission gating per state transition
  if (parse.data.state === "in_test" && !can(ctx.role, "advance_to_test"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (parse.data.state === "approved" && !can(ctx.role, "approve_recipe"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if ((parse.data.title || parse.data.contentJson) && !can(ctx.role, "edit_recipe"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Editing content of an approved recipe is admin-only: the team has signed
  // off on this version, so changes need a stricter sign-off than the normal
  // edit_recipe permission. State transitions (priority, etc.) still go
  // through the per-action checks above.
  if (
    existing.state === "approved" &&
    (parse.data.title !== undefined || parse.data.contentJson !== undefined) &&
    ctx.role !== "admin"
  ) {
    return NextResponse.json(
      { error: "Solo el admin puede modificar recetas aprobadas" },
      { status: 403 },
    );
  }

  const data: Prisma.RecipeUpdateInput = {};
  if (parse.data.title !== undefined) data.title = parse.data.title;
  if (parse.data.contentJson !== undefined) data.contentJson = parse.data.contentJson;
  if (parse.data.priority !== undefined) data.priority = parse.data.priority;
  if (parse.data.state !== undefined) {
    data.state = parse.data.state;
    if (parse.data.state === "approved") {
      data.approvedBy = { connect: { id: ctx.userId } };
      data.approvedAt = new Date();
    }
  }
  if (parse.data.title || parse.data.contentJson || parse.data.recipeIngredients) {
    data.version = { increment: 1 };
  }

  // Si vienen ingredientes estructurados, validamos productIds + reemplazamos
  // las filas existentes (delete + insert) dentro de la misma transacción
  // que el update del Recipe — atómico.
  if (parse.data.recipeIngredients !== undefined) {
    const productIds = parse.data.recipeIngredients
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

    const updated = await prisma.$transaction(async (tx) => {
      await tx.recipe.update({ where: { id }, data });
      await tx.recipeIngredient.deleteMany({ where: { recipeId: id } });
      if (parse.data.recipeIngredients!.length > 0) {
        await tx.recipeIngredient.createMany({
          data: parse.data.recipeIngredients!.map((ing, idx) => ({
            recipeId: id,
            productId: ing.productId ?? null,
            position: idx,
            rawText: ing.rawText,
            qty: ing.qty ?? null,
            unit: ing.unit ?? null,
            pezzatura: ing.pezzatura ?? null,
            mermaOverridePct: ing.mermaOverridePct ?? null,
          })),
        });
      }
      return tx.recipe.findUnique({ where: { id }, include: recipeDetailInclude });
    });

    if (!updated) throw new Error("recipe_update_lost");

    if (parse.data.state) {
      logger.info("recipe_state_changed", {
        recipeId: id,
        state: parse.data.state,
        userId: ctx.userId,
      });
    }

    return NextResponse.json(projectRecipeDetail(updated));
  }

  // Path sin ingredientes estructurados (legacy).
  const updated = await prisma.recipe.update({
    where: { id },
    data,
    include: recipeDetailInclude,
  });

  if (parse.data.state) {
    logger.info("recipe_state_changed", {
      recipeId: id,
      state: parse.data.state,
      userId: ctx.userId,
    });
  }

  return NextResponse.json(projectRecipeDetail(updated));
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth(req, "approve_recipe"); // chef_executive+ deletes
  if (isNextResponse(ctx)) return ctx;
  const { id } = await params;

  const existing = await prisma.recipe.findUnique({ where: { id } });
  if (!existing || existing.restaurantId !== ctx.restaurantId || existing.deletedAt !== null)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.recipe.update({ where: { id }, data: { deletedAt: new Date() } });
  logger.info("recipe_deleted", { recipeId: id, userId: ctx.userId });
  return NextResponse.json({ ok: true });
}
