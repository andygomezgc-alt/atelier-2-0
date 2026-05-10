import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { AddMenuItemRequestSchema } from "@atelier/shared";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth(req, "edit_menu");
  if (isNextResponse(ctx)) return ctx;
  const { id: menuId } = await params;

  const body = await req.json();
  const parse = AddMenuItemRequestSchema.safeParse(body);
  if (!parse.success)
    return NextResponse.json({ error: parse.error.flatten() }, { status: 400 });

  const menu = await prisma.menuFolder.findUnique({ where: { id: menuId } });
  if (!menu || menu.restaurantId !== ctx.restaurantId)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const recipe = await prisma.recipe.findUnique({ where: { id: parse.data.recipeId } });
  if (!recipe || recipe.restaurantId !== ctx.restaurantId || recipe.deletedAt !== null)
    return NextResponse.json({ error: "Recipe not in restaurant" }, { status: 404 });

  const last = await prisma.menuItem.findFirst({
    where: { menuFolderId: menuId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const nextOrder = (last?.order ?? -1) + 1;

  const created = await prisma.menuItem.create({
    data: {
      menuFolderId: menuId,
      recipeId: parse.data.recipeId,
      customName: parse.data.customName ?? null,
      customDesc: parse.data.customDesc ?? null,
      price: parse.data.price,
      order: nextOrder,
    },
  });
  logger.info("menu_item_added", {
    menuId,
    itemId: created.id,
    recipeId: parse.data.recipeId,
    userId: ctx.userId,
  });

  if (parse.data.presentationStyle) {
    await prisma.menuFolder.update({
      where: { id: menuId },
      data: { presentationStyle: parse.data.presentationStyle },
    });
  }

  const full = await prisma.menuFolder.findUnique({
    where: { id: menuId },
    include: {
      items: {
        orderBy: { order: "asc" },
        include: { recipe: { select: { title: true } } },
      },
    },
  });
  if (!full) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    id: full.id,
    name: full.name,
    season: full.season,
    presentationStyle: full.presentationStyle,
    items: full.items.map((it) => ({
      id: it.id,
      recipeId: it.recipeId,
      name: it.customName ?? it.recipe?.title ?? "",
      description: it.customDesc ?? "",
      price: it.price,
      order: it.order,
    })),
  });
}
