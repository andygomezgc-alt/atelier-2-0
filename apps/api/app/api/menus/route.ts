import { NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { CreateMenuRequestSchema, type CreateMenuRequest } from "@atelier/shared";
import { withAuth } from "@/lib/with-auth";
import { logger } from "@/lib/logger";
import { projectMenuListItem, menuListInclude } from "@/lib/projections";

export const dynamic = "force-dynamic";

export const GET = withAuth({}, async (ctx) => {
  const menus = await prisma.menuFolder.findMany({
    where: { restaurantId: ctx.restaurantId },
    orderBy: { updatedAt: "desc" },
    include: menuListInclude,
  });

  return NextResponse.json(menus.map(projectMenuListItem));
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
