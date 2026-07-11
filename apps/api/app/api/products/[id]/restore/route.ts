// Restaurar un producto desde la papelera (auditoría jul 2026): el borrado es
// soft (deletedAt), así que "restaurar" solo lo limpia. Vuelve con su estado
// original (activo/borrador/archivado), no se re-crea nada.

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

  const existing = await prisma.product.findUnique({
    where: { id },
    select: { id: true, restaurantId: true, deletedAt: true },
  });
  // Anti-IDOR + solo tiene sentido restaurar algo que está en la papelera.
  if (
    !existing ||
    existing.restaurantId !== ctx.restaurantId ||
    existing.deletedAt === null
  )
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const restored = await prisma.product.update({
    where: { id },
    data: { deletedAt: null },
  });

  logger.info("product_restored", {
    productId: id,
    restaurantId: ctx.restaurantId,
    userId: ctx.userId,
  });

  return NextResponse.json(projectProductDetail(restored));
}
