import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { AddMenuItemRequestSchema } from "@atelier/shared";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { logger } from "@/lib/logger";
import { projectMenuDetail, menuDetailInclude } from "@/lib/projections";

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

  // Las 3 lecturas iniciales son independientes — paralelizamos para ahorrar
  // ~2 round-trips contra Neon (~60ms en local típico).
  const [menu, recipe, last] = await Promise.all([
    prisma.menuFolder.findUnique({ where: { id: menuId } }),
    prisma.recipe.findUnique({ where: { id: parse.data.recipeId } }),
    // Per-section order: el nuevo plato queda al final de SU sección, no al
    // final global del menú. Esto es lo que el usuario espera visualmente.
    prisma.menuItem.findFirst({
      where: { menuFolderId: menuId, sectionId: parse.data.sectionId ?? null },
      orderBy: { order: "desc" },
      select: { order: true },
    }),
  ]);

  if (!menu || menu.restaurantId !== ctx.restaurantId)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!recipe || recipe.restaurantId !== ctx.restaurantId || recipe.deletedAt !== null)
    return NextResponse.json({ error: "Recipe not in restaurant" }, { status: 404 });

  const nextOrder = (last?.order ?? -1) + 1;

  const created = await prisma.menuItem.create({
    data: {
      menuFolderId: menuId,
      recipeId: parse.data.recipeId,
      sectionId: parse.data.sectionId ?? null,
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
    include: menuDetailInclude,
  });
  if (!full) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(projectMenuDetail(full));
}
