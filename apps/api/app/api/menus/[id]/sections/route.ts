// POST /api/menus/[id]/sections — crear una sección dentro de un menú.
//
// El `order` se calcula como `max(existing.order) + 1` para que la nueva
// sección quede al final. Si más tarde el usuario quiere reordenar, hay un
// PATCH a /[sectionId] que acepta `order`.

import { NextRequest, NextResponse } from "next/server";
import { prisma, Prisma } from "@atelier/db";
import { CreateMenuSectionRequestSchema } from "@atelier/shared";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { projectMenuDetail, menuDetailInclude } from "@/lib/projections";

export const dynamic = "force-dynamic";

// P2-4 (auditoría jul 2026): mismo fix que items/route.ts — nextOrder y el
// create van dentro de una transacción Serializable con retry ante P2034.
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

  for (let attempt = 1; ; attempt++) {
    try {
      await prisma.$transaction(
        async (tx) => {
          const max = await tx.menuSection.aggregate({
            where: { menuFolderId: menuId },
            _max: { order: true },
          });
          const nextOrder = (max._max.order ?? -1) + 1;
          await tx.menuSection.create({
            data: {
              menuFolderId: menuId,
              name: parse.data.name,
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

  const full = await prisma.menuFolder.findUnique({
    where: { id: menuId },
    include: menuDetailInclude,
  });
  if (!full) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(projectMenuDetail(full));
}
