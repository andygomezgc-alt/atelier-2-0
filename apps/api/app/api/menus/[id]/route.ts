import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { PatchMenuRequestSchema } from "@atelier/shared";
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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth(req);
  if (isNextResponse(ctx)) return ctx;
  if (!ctx.restaurantId)
    return NextResponse.json({ error: "Not in a restaurant" }, { status: 403 });
  const { id } = await params;

  const menu = await loadFullMenu(id);
  if (!menu || menu.restaurantId !== ctx.restaurantId)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(projectMenuDetail(menu));
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth(req, "edit_menu");
  if (isNextResponse(ctx)) return ctx;
  const { id } = await params;

  const body = await req.json();
  const parse = PatchMenuRequestSchema.safeParse(body);
  if (!parse.success)
    return NextResponse.json({ error: parse.error.flatten() }, { status: 400 });

  const existing = await prisma.menuFolder.findUnique({ where: { id } });
  if (!existing || existing.restaurantId !== ctx.restaurantId)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.menuFolder.update({
    where: { id },
    data: parse.data,
  });

  const menu = await loadFullMenu(id);
  if (!menu) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(projectMenuDetail(menu));
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth(req, "delete_menu");
  if (isNextResponse(ctx)) return ctx;
  const { id } = await params;

  const existing = await prisma.menuFolder.findUnique({ where: { id } });
  if (!existing || existing.restaurantId !== ctx.restaurantId)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.menuFolder.delete({ where: { id } });
  logger.info("menu_deleted", { menuId: id, userId: ctx.userId });
  return new NextResponse(null, { status: 204 });
}
