import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { PatchMenuItemRequestSchema } from "@atelier/shared";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { logger } from "@/lib/logger";
import { projectMenuDetail, menuDetailInclude } from "@/lib/projections";

export const dynamic = "force-dynamic";

async function loadFullMenu(menuId: string) {
  return prisma.menuFolder.findUnique({
    where: { id: menuId },
    include: menuDetailInclude,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const ctx = await requireAuth(req, "edit_menu");
  if (isNextResponse(ctx)) return ctx;
  const { id: menuId, itemId } = await params;

  const body = await req.json();
  const parse = PatchMenuItemRequestSchema.safeParse(body);
  if (!parse.success)
    return NextResponse.json({ error: parse.error.flatten() }, { status: 400 });

  const item = await prisma.menuItem.findUnique({
    where: { id: itemId },
    include: { menuFolder: { select: { id: true, restaurantId: true } } },
  });
  if (!item || item.menuFolderId !== menuId || item.menuFolder?.restaurantId !== ctx.restaurantId)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { presentationStyle, ...itemData } = parse.data;
  await prisma.menuItem.update({ where: { id: itemId }, data: itemData });
  if (presentationStyle) {
    await prisma.menuFolder.update({
      where: { id: menuId },
      data: { presentationStyle },
    });
  }

  const menu = await loadFullMenu(menuId);
  if (!menu) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(projectMenuDetail(menu));
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const ctx = await requireAuth(req, "edit_menu");
  if (isNextResponse(ctx)) return ctx;
  const { id: menuId, itemId } = await params;

  const item = await prisma.menuItem.findUnique({
    where: { id: itemId },
    include: { menuFolder: { select: { id: true, restaurantId: true } } },
  });
  if (!item || item.menuFolderId !== menuId || item.menuFolder?.restaurantId !== ctx.restaurantId)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.menuItem.delete({ where: { id: itemId } });
  logger.info("menu_item_removed", { menuId, itemId, userId: ctx.userId });
  return NextResponse.json({ ok: true });
}
