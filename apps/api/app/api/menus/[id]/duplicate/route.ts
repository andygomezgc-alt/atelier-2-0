// Duplicar un menú como copia nueva (para armar variantes de carta por
// temporada sin rehacer todo). Clona secciones, ítems (mapeando cada ítem a la
// nueva sección) y la capa de overrides del PDF cliente. La copia NO entra en
// servicio sola (inService=false). Referencia las MISMAS recetas.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import type { Prisma } from "@atelier/db";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { logger } from "@/lib/logger";
import { projectMenuDetail, menuDetailInclude } from "@/lib/projections";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth(req, "edit_menu");
  if (isNextResponse(ctx)) return ctx;
  const { id } = await params;

  const source = await prisma.menuFolder.findUnique({
    where: { id },
    include: {
      sections: { orderBy: { order: "asc" } },
      items: { orderBy: { order: "asc" } },
      clientOverride: true,
    },
  });
  if (!source || source.restaurantId !== ctx.restaurantId)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const copy = await prisma.$transaction(async (tx) => {
    const folder = await tx.menuFolder.create({
      data: {
        restaurantId: ctx.restaurantId,
        name: `${source.name} (copia)`,
        season: source.season,
        presentationStyle: source.presentationStyle,
        showAllergensInPdf: source.showAllergensInPdf,
        inService: false,
      },
    });

    // Secciones: nuevas filas, guardamos el mapeo viejo→nuevo para los ítems.
    const sectionMap = new Map<string, string>();
    for (const s of source.sections) {
      const ns = await tx.menuSection.create({
        data: { menuFolderId: folder.id, name: s.name, order: s.order },
      });
      sectionMap.set(s.id, ns.id);
    }

    if (source.items.length > 0) {
      await tx.menuItem.createMany({
        data: source.items.map((it) => ({
          menuFolderId: folder.id,
          sectionId: it.sectionId ? (sectionMap.get(it.sectionId) ?? null) : null,
          recipeId: it.recipeId,
          customName: it.customName,
          customDesc: it.customDesc,
          price: it.price,
          order: it.order,
        })),
      });
    }

    if (source.clientOverride) {
      await tx.menuClientOverride.create({
        data: {
          menuFolderId: folder.id,
          overrides: source.clientOverride.overrides as Prisma.InputJsonValue,
        },
      });
    }

    return tx.menuFolder.findUnique({ where: { id: folder.id }, include: menuDetailInclude });
  });

  if (!copy) throw new Error("menu_duplicate_lost");

  logger.info("menu_duplicated", {
    sourceId: id,
    newId: copy.id,
    restaurantId: ctx.restaurantId,
    userId: ctx.userId,
    sections: source.sections.length,
    items: source.items.length,
  });

  return NextResponse.json(projectMenuDetail(copy), { status: 201 });
}
