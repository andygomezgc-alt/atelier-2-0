// POST /api/menus/[id]/items/reorder
//
// Swap atómico del `order` entre dos items. Existe porque hacer dos PATCH en
// paralelo desde el cliente abre una ventana donde ambos items pueden tener
// el mismo order, o donde una falla y la otra no (queda inconsistente).
//
// `$transaction` garantiza que ambos updates pegan o ninguno; sin ventana de
// inconsistencia incluso si el server crashea entre ellos.

import { NextRequest, NextResponse } from "next/server";
import { prisma, Prisma } from "@atelier/db";
import { ReorderItemsRequestSchema } from "@atelier/shared";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { projectMenuDetail, menuDetailInclude } from "@/lib/projections";

export const dynamic = "force-dynamic";

// P2-5 (auditoría jul 2026): las lecturas de a/b vivían fuera de la
// transacción (lost-update: dos reorders concurrentes podían dejar dos
// items con el mismo order). Ahora todo — lectura, validación y swap — pasa
// dentro de un callback interactivo con Serializable + retry ante P2034.
const MAX_ORDER_RETRIES = 3;

function isSerializationConflict(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034";
}

class ReorderNotFoundError extends Error {}

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

  try {
    for (let attempt = 1; ; attempt++) {
      try {
        await prisma.$transaction(
          async (tx) => {
            const [a, b] = await Promise.all([
              tx.menuItem.findUnique({
                where: { id: itemAId },
                include: { menuFolder: { select: { id: true, restaurantId: true } } },
              }),
              tx.menuItem.findUnique({
                where: { id: itemBId },
                include: { menuFolder: { select: { id: true, restaurantId: true } } },
              }),
            ]);
            if (
              !a || !b ||
              a.menuFolderId !== menuId || b.menuFolderId !== menuId ||
              a.menuFolder?.restaurantId !== ctx.restaurantId ||
              b.menuFolder?.restaurantId !== ctx.restaurantId
            ) {
              throw new ReorderNotFoundError();
            }

            // Swap atómico. Si la DB falla entre las dos updates, ninguna queda aplicada.
            await tx.menuItem.update({ where: { id: itemAId }, data: { order: b.order } });
            await tx.menuItem.update({ where: { id: itemBId }, data: { order: a.order } });
          },
          { isolationLevel: "Serializable" },
        );
        break;
      } catch (err) {
        if (err instanceof ReorderNotFoundError) throw err;
        if (!isSerializationConflict(err) || attempt >= MAX_ORDER_RETRIES) throw err;
      }
    }
  } catch (err) {
    if (err instanceof ReorderNotFoundError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw err;
  }

  const full = await prisma.menuFolder.findUnique({
    where: { id: menuId },
    include: menuDetailInclude,
  });
  if (!full) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(projectMenuDetail(full));
}
