import { NextRequest, NextResponse } from "next/server";
import { prisma, Prisma } from "@atelier/db";
import { AddMenuItemRequestSchema } from "@atelier/shared";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { logger } from "@/lib/logger";
import { projectMenuDetail, menuDetailInclude } from "@/lib/projections";

export const dynamic = "force-dynamic";

// P2-4 (auditoría jul 2026): dos POST casi simultáneos pueden leer el mismo
// `last.order` fuera de transacción y crear dos filas con el mismo order.
// Serializable hace que Postgres aborte una de las dos con P2034; reintentamos
// hasta MAX_ORDER_RETRIES veces (la segunda pasada ya ve el order actualizado).
const MAX_ORDER_RETRIES = 3;

function isSerializationConflict(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034";
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth(req, "edit_menu");
  if (isNextResponse(ctx)) return ctx;
  const { id: menuId } = await params;

  const body = await req.json();
  const parse = AddMenuItemRequestSchema.safeParse(body);
  if (!parse.success)
    return NextResponse.json({ error: parse.error.flatten() }, { status: 400 });

  const [menu, recipe] = await Promise.all([
    prisma.menuFolder.findUnique({ where: { id: menuId } }),
    prisma.recipe.findUnique({ where: { id: parse.data.recipeId } }),
  ]);

  if (!menu || menu.restaurantId !== ctx.restaurantId)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!recipe || recipe.restaurantId !== ctx.restaurantId || recipe.deletedAt !== null)
    return NextResponse.json({ error: "Recipe not in restaurant" }, { status: 404 });

  // P2-4: el cálculo de nextOrder (findFirst) y el create van DENTRO de la
  // misma transacción Serializable — cierra la ventana donde dos requests
  // leen el mismo `last.order` y crean dos filas con el mismo order.
  let created;
  for (let attempt = 1; ; attempt++) {
    try {
      created = await prisma.$transaction(
        async (tx) => {
          // Per-section order: el nuevo plato queda al final de SU sección,
          // no al final global del menú. Esto es lo que el usuario espera.
          const last = await tx.menuItem.findFirst({
            where: { menuFolderId: menuId, sectionId: parse.data.sectionId ?? null },
            orderBy: { order: "desc" },
            select: { order: true },
          });
          const nextOrder = (last?.order ?? -1) + 1;
          return tx.menuItem.create({
            data: {
              menuFolderId: menuId,
              recipeId: parse.data.recipeId,
              sectionId: parse.data.sectionId ?? null,
              customName: parse.data.customName ?? null,
              customDesc: parse.data.customDesc ?? null,
              price: parse.data.price,
              order: nextOrder,
            },
          });
        },
        { isolationLevel: "Serializable" },
      );
      break;
    } catch (err) {
      if (!isSerializationConflict(err) || attempt >= MAX_ORDER_RETRIES) throw err;
    }
  }
  logger.info("menu_item_added", {
    menuId,
    itemId: created.id,
    recipeId: parse.data.recipeId,
    userId: ctx.userId,
  });

  if (parse.data.presentationStyle) {
    await prisma.menuFolder.update({
      where: { id: menuId },
      data: { presentationStyle: parse.data.presentationStyle },
    });
  }

  const full = await prisma.menuFolder.findUnique({
    where: { id: menuId },
    include: menuDetailInclude,
  });
  if (!full) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(projectMenuDetail(full));
}
