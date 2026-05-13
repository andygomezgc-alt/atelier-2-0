import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { withAuth } from "@/lib/with-auth";

export const dynamic = "force-dynamic";

// GET /api/products/:id/history
//
// Devuelve el histórico de cambios de precio + las pruebas de rendimiento
// (yield tests) del producto, ambos ordenados por createdAt desc. El cliente
// los muestra en la pantalla de detalle.
//
// IDOR-guarded: chequeamos que el producto pertenezca al restaurante del
// caller antes de exponer cualquier histórico.
export const GET = withAuth({}, async (ctx, _body, req: NextRequest) => {
  // En /api/products/[id]/history, el segundo desde el final es el id.
  const segs = req.nextUrl.pathname.split("/");
  const id = segs[segs.length - 2]!;

  const product = await prisma.product.findUnique({
    where: { id },
    select: { id: true, restaurantId: true, deletedAt: true },
  });
  if (
    !product ||
    product.restaurantId !== ctx.restaurantId ||
    product.deletedAt !== null
  )
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Las dos queries son independientes — paralelizar para ahorrar un round-trip.
  const [priceHistory, yieldTests] = await Promise.all([
    prisma.productPriceHistory.findMany({
      where: { productId: id },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { author: { select: { id: true, name: true } } },
    }),
    prisma.yieldTest.findMany({
      where: { productId: id },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { author: { select: { id: true, name: true } } },
    }),
  ]);

  return NextResponse.json({
    priceHistory: priceHistory.map((row) => ({
      id: row.id,
      precio: row.precio,
      unidadCompra: row.unidadCompra,
      createdAt: row.createdAt.toISOString(),
      author: row.author,
    })),
    yieldTests: yieldTests.map((row) => ({
      id: row.id,
      pesoBrutoG: Number(row.pesoBrutoG),
      pesoUtilG: Number(row.pesoUtilG),
      mermaCalculadaPct: Number(row.mermaCalculadaPct),
      notas: row.notas,
      createdAt: row.createdAt.toISOString(),
      author: row.author,
    })),
  });
});
