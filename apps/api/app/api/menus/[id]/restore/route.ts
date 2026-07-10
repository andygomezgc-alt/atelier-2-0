// Restaurar un menú desde la papelera (borrado suave → deletedAt=null). Vuelve
// con su estado tal cual (secciones, ítems y overrides quedaron intactos).

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { logger } from "@/lib/logger";
import { projectMenuDetail, menuDetailInclude } from "@/lib/projections";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth(req, "delete_menu");
  if (isNextResponse(ctx)) return ctx;
  const { id } = await params;

  const existing = await prisma.menuFolder.findUnique({
    where: { id },
    select: { id: true, restaurantId: true, deletedAt: true },
  });
  if (!existing || existing.restaurantId !== ctx.restaurantId || existing.deletedAt === null)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.menuFolder.update({ where: { id }, data: { deletedAt: null } });
  const restored = await prisma.menuFolder.findUnique({ where: { id }, include: menuDetailInclude });
  if (!restored) throw new Error("menu_restore_lost");

  logger.info("menu_restored", { menuId: id, restaurantId: ctx.restaurantId, userId: ctx.userId });

  return NextResponse.json(projectMenuDetail(restored));
}
