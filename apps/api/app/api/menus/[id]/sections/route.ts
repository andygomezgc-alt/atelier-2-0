// POST /api/menus/[id]/sections — crear una sección dentro de un menú.
//
// El `order` se calcula como `max(existing.order) + 1` para que la nueva
// sección quede al final. Si más tarde el usuario quiere reordenar, hay un
// PATCH a /[sectionId] que acepta `order`.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { CreateMenuSectionRequestSchema } from "@atelier/shared";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { projectMenuDetail, menuDetailInclude } from "@/lib/projections";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth(req, "edit_menu");
  if (isNextResponse(ctx)) return ctx;
  if (!ctx.restaurantId)
    return NextResponse.json({ error: "Not in a restaurant" }, { status: 403 });
  const { id: menuId } = await params;

  const body = await req.json();
  const parse = CreateMenuSectionRequestSchema.safeParse(body);
  if (!parse.success)
    return NextResponse.json({ error: parse.error.flatten() }, { status: 400 });

  const menu = await prisma.menuFolder.findUnique({ where: { id: menuId } });
  if (!menu || menu.restaurantId !== ctx.restaurantId)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const max = await prisma.menuSection.aggregate({
    where: { menuFolderId: menuId },
    _max: { order: true },
  });
  const nextOrder = (max._max.order ?? -1) + 1;

  await prisma.menuSection.create({
    data: {
      menuFolderId: menuId,
      name: parse.data.name,
      order: nextOrder,
    },
  });

  const full = await prisma.menuFolder.findUnique({
    where: { id: menuId },
    include: menuDetailInclude,
  });
  if (!full) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(projectMenuDetail(full));
}
