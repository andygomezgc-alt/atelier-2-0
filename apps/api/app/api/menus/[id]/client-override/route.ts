// PATCH /api/menus/[id]/client-override
//
// Reemplaza (upsert) toda la capa de overrides solo-PDF-cliente. El cuerpo
// es el objeto entero `overrides`; el endpoint guarda esa snapshot bajo el
// menú indicado y devuelve el MenuDetail actualizado (con `clientOverrides`
// poblado para refrescar la UI).
//
// Permission: `edit_menu` — la separación con el staff es a nivel de cuáles
// campos se persisten (acá: nuevos JSON; allá: MenuItem/MenuFolder), no a
// nivel de quién puede.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { PatchClientOverridesRequestSchema } from "@atelier/shared";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { projectMenuDetail, menuDetailInclude } from "@/lib/projections";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth(req, "edit_menu");
  if (isNextResponse(ctx)) return ctx;
  if (!ctx.restaurantId)
    return NextResponse.json({ error: "Not in a restaurant" }, { status: 403 });
  const { id: menuId } = await params;

  const body = await req.json();
  const parse = PatchClientOverridesRequestSchema.safeParse(body);
  if (!parse.success)
    return NextResponse.json({ error: parse.error.flatten() }, { status: 400 });

  const menu = await prisma.menuFolder.findUnique({ where: { id: menuId } });
  if (!menu || menu.restaurantId !== ctx.restaurantId)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Replace-mode upsert: la UI cliente envía el snapshot completo del JSON.
  await prisma.menuClientOverride.upsert({
    where: { menuFolderId: menuId },
    create: { menuFolderId: menuId, overrides: parse.data },
    update: { overrides: parse.data },
  });

  const full = await prisma.menuFolder.findUnique({
    where: { id: menuId },
    include: menuDetailInclude,
  });
  if (!full) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(projectMenuDetail(full));
}
