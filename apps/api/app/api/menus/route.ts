import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { CreateMenuRequestSchema, type CreateMenuRequest } from "@atelier/shared";
import { withAuth } from "@/lib/with-auth";
import { logger } from "@/lib/logger";
import { projectMenuListItem, menuListInclude } from "@/lib/projections";

export const dynamic = "force-dynamic";

export const GET = withAuth({}, async (ctx, _body, req: NextRequest) => {
  // Papelera: ?trash=true lista los menús borrados (soft-delete) para restaurar.
  const trash = new URL(req.url).searchParams.get("trash") === "true";
  const menus = await prisma.menuFolder.findMany({
    where: { restaurantId: ctx.restaurantId, deletedAt: trash ? { not: null } : null },
    orderBy: trash ? { deletedAt: "desc" } : { updatedAt: "desc" },
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
