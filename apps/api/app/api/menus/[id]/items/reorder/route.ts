// POST /api/menus/[id]/items/reorder
//
// Swap atómico del `order` entre dos items. Existe porque hacer dos PATCH en
// paralelo desde el cliente abre una ventana donde ambos items pueden tener
// el mismo order, o donde una falla y la otra no (queda inconsistente).
//
// `$transaction` garantiza que ambos updates pegan o ninguno; sin ventana de
// inconsistencia incluso si el server crashea entre ellos.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { ReorderItemsRequestSchema } from "@atelier/shared";
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
  const parse = ReorderItemsRequestSchema.safeParse(body);
  if (!parse.success)
    return NextResponse.json({ error: parse.error.flatten() }, { status: 400 });
  const { itemAId, itemBId } = parse.data;
  if (itemAId === itemBId)
    return NextResponse.json({ error: "Items must differ" }, { status: 400 });

  const [a, b] = await Promise.all([
    prisma.menuItem.findUnique({
      where: { id: itemAId },
      include: { menuFolder: { select: { id: true, restaurantId: true } } },
    }),
    prisma.menuItem.findUnique({
      where: { id: itemBId },
      include: { menuFolder: { select: { id: true, restaurantId: true } } },
    }),
  ]);
  const valid =
    a && b &&
    a.menuFolderId === menuId && b.menuFolderId === menuId &&
    a.menuFolder?.restaurantId === ctx.restaurantId &&
    b.menuFolder?.restaurantId === ctx.restaurantId;
  if (!valid) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Swap atómico. Si la DB falla entre las dos updates, ninguna queda aplicada.
  await prisma.$transaction([
    prisma.menuItem.update({ where: { id: itemAId }, data: { order: b.order } }),
    prisma.menuItem.update({ where: { id: itemBId }, data: { order: a.order } }),
  ]);

  const full = await prisma.menuFolder.findUnique({
    where: { id: menuId },
    include: menuDetailInclude,
  });
  if (!full) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(projectMenuDetail(full));
}
