// Duplicar un producto como borrador nuevo (auditoría jul 2026): útil para
// crear variantes (otro proveedor, otro calibre) sin rehacer la carga. La
// copia nace SIEMPRE en estado "borrador", con "(copia)" en el nombre y SIN
// aliases (los alias identifican al ORIGINAL en el matching; si se copiaran,
// el banco tendría dos productos disputándose el mismo nombre). El resto de
// los campos (categoría, unidad, precio, merma, pezzatura, proveedor, notas,
// criticidad, alérgeno) se clonan tal cual.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { logger } from "@/lib/logger";
import { projectProductDetail } from "@/lib/products/projections";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth(req, "manage_products");
  if (isNextResponse(ctx)) return ctx;
  const { id } = await params;

  const source = await prisma.product.findUnique({ where: { id } });
  if (
    !source ||
    source.restaurantId !== ctx.restaurantId ||
    source.deletedAt !== null
  )
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const copy = await prisma.product.create({
    data: {
      restaurantId: ctx.restaurantId,
      name: `${source.name} (copia)`,
      category: source.category,
      pezzatura: source.pezzatura,
      pezzaturaMode: source.pezzaturaMode,
      pezzaturaMin: source.pezzaturaMin,
      pezzaturaMax: source.pezzaturaMax,
      unidadCompra: source.unidadCompra,
      precioCompra: source.precioCompra,
      mermaPct: source.mermaPct,
      mermaOrigen: source.mermaOrigen,
      proveedor: source.proveedor,
      notas: source.notas,
      allergen: source.allergen,
      estado: "borrador",
      aliases: [],
      criticality: source.criticality,
      criticalityManual: source.criticalityManual,
    },
  });

  logger.info("product_duplicated", {
    sourceId: id,
    newId: copy.id,
    restaurantId: ctx.restaurantId,
    userId: ctx.userId,
  });

  return NextResponse.json(projectProductDetail(copy), { status: 201 });
}
