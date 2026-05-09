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
  if (parse.data.title || parse.data.contentJson) {
    data.version = { increment: 1 };
  }

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
