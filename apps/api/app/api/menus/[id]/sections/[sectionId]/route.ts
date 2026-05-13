// PATCH / DELETE /api/menus/[id]/sections/[sectionId]
//
// PATCH renombra o reordena. DELETE borra la sección — la FK en MenuItem es
// ON DELETE SET NULL, así que los platos quedan con sectionId=null (en la
// app aparecen como "Sin sección" hasta que el usuario los reasigne).

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { PatchMenuSectionRequestSchema } from "@atelier/shared";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { projectMenuDetail, menuDetailInclude } from "@/lib/projections";

export const dynamic = "force-dynamic";

async function loadMenuOr404(menuId: string, restaurantId: string) {
  const menu = await prisma.menuFolder.findUnique({ where: { id: menuId } });
  if (!menu || menu.restaurantId !== restaurantId) return null;
  return menu;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sectionId: string }> },
) {
  const ctx = await requireAuth(req, "edit_menu");
  if (isNextResponse(ctx)) return ctx;
  if (!ctx.restaurantId)
    return NextResponse.json({ error: "Not in a restaurant" }, { status: 403 });
  const { id: menuId, sectionId } = await params;

  const body = await req.json();
  const parse = PatchMenuSectionRequestSchema.safeParse(body);
  if (!parse.success)
    return NextResponse.json({ error: parse.error.flatten() }, { status: 400 });

  if (!(await loadMenuOr404(menuId, ctx.restaurantId)))
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const section = await prisma.menuSection.findUnique({ where: { id: sectionId } });
  if (!section || section.menuFolderId !== menuId)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: { name?: string; order?: number } = {};
  if (parse.data.name !== undefined) data.name = parse.data.name;
  if (parse.data.order !== undefined) data.order = parse.data.order;
  if (Object.keys(data).length === 0)
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });

  await prisma.menuSection.update({ where: { id: sectionId }, data });

  const full = await prisma.menuFolder.findUnique({
    where: { id: menuId },
    include: menuDetailInclude,
  });
  if (!full) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(projectMenuDetail(full));
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sectionId: string }> },
) {
  const ctx = await requireAuth(req, "edit_menu");
  if (isNextResponse(ctx)) return ctx;
  if (!ctx.restaurantId)
    return NextResponse.json({ error: "Not in a restaurant" }, { status: 403 });
  const { id: menuId, sectionId } = await params;

  if (!(await loadMenuOr404(menuId, ctx.restaurantId)))
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const section = await prisma.menuSection.findUnique({ where: { id: sectionId } });
  if (!section || section.menuFolderId !== menuId)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  // FK on MenuItem.sectionId is ON DELETE SET NULL — items survive, just
  // become unsectioned in the response.
  await prisma.menuSection.delete({ where: { id: sectionId } });

  const full = await prisma.menuFolder.findUnique({
    where: { id: menuId },
    include: menuDetailInclude,
  });
  if (!full) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(projectMenuDetail(full));
}
