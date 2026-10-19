import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { CreateMenuRequestSchema, can, type CreateMenuRequest } from "@atelier/shared";
import { withAuth } from "@/lib/with-auth";
import { logger } from "@/lib/logger";
import {
  activeMenuItemsWhere,
  menuCostItemSelect,
  menuListInclude,
  projectMenuCostSummary,
  projectMenuListItem,
} from "@/lib/projections";

export const dynamic = "force-dynamic";

export const GET = withAuth({}, async (ctx, _body, req: NextRequest) => {
  // Papelera: ?trash=true lista los menús borrados (soft-delete) para restaurar.
  const trash = new URL(req.url).searchParams.get("trash") === "true";
  const menus = await prisma.menuFolder.findMany({
    where: { restaurantId: ctx.restaurantId, deletedAt: trash ? { not: null } : null },
    orderBy: trash ? { deletedAt: "desc" } : { updatedAt: "desc" },
    include: menuListInclude,
  });

  const projected = menus.map(projectMenuListItem);
  // In-service menus carry their average dish cost and margin. Costs come from
  // recipes, so they need the same permission as the recipe list.
  const inServiceIds =
    trash || !can(ctx.role, "view_staff_recipe") ? [] : menus.filter((m) => m.inService).map((m) => m.id);
  if (inServiceIds.length === 0) return NextResponse.json(projected);

  const items = await prisma.menuItem.findMany({
    where: { menuFolderId: { in: inServiceIds }, ...activeMenuItemsWhere },
    select: menuCostItemSelect,
  });
  return NextResponse.json(
    projected.map((menu) =>
      menu.inService
        ? { ...menu, costSummary: projectMenuCostSummary(items.filter((item) => item.menuFolderId === menu.id)) }
        : menu,
    ),
  );
});

export const POST = withAuth(
  { permission: "create_menu", body: CreateMenuRequestSchema },
  async (ctx, body: CreateMenuRequest) => {
    const menu = await prisma.menuFolder.create({
      data: {
        name: body.name,
        season: body.season ?? null,
        restaurantId: ctx.restaurantId,
        presentationStyle: "elegant",
      },
    });

    logger.info("menu_created", {
      menuId: menu.id,
      restaurantId: ctx.restaurantId,
      userId: ctx.userId,
    });

    return NextResponse.json(
      projectMenuListItem({ ...menu, _count: { items: 0 } }),
      { status: 201 },
    );
  },
);
