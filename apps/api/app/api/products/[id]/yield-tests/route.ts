// POST /api/products/:id/yield-tests
//
// Crea una prueba de rendimiento para el producto:
//   - Persiste YieldTest con peso bruto + útil + merma calculada.
//   - Actualiza Product.mermaPct con la merma medida (prioridad sobre
//     sugerida/confirmada) y mermaOrigen = 'medida'.
//   - Devuelve { product, yieldTest } para que el cliente refresque ambos.
//
// Si el chef quiere conservar la merma anterior (porque la nueva prueba
// dio un resultado atípico que no quiere usar como default), puede editar
// el producto manualmente vía PATCH /api/products/:id después. La regla
// "última prueba gana" es conservadora pero documentada.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import {
  CreateYieldTestRequestSchema,
  type CreateYieldTestRequest,
} from "@atelier/shared";
import { withAuth } from "@/lib/with-auth";
import { logger } from "@/lib/logger";
import { computeMermaPctFromYield } from "@/lib/products/yield";
import { projectProductDetail } from "@/lib/products/projections";
import { countRecipesUsingProduct } from "@/lib/products/usage";

export const dynamic = "force-dynamic";

export const POST = withAuth(
  { permission: "manage_products", body: CreateYieldTestRequestSchema },
  async (ctx, body: CreateYieldTestRequest, req: NextRequest) => {
    // En /api/products/[id]/yield-tests el id es el segundo-desde-el-final.
    const segs = req.nextUrl.pathname.split("/");
    const productId = segs[segs.length - 2]!;

    const existing = await prisma.product.findUnique({ where: { id: productId } });
    if (
      !existing ||
      existing.restaurantId !== ctx.restaurantId ||
      existing.deletedAt !== null
    )
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Validación defensiva — el schema Zod + CHECK constraints ya bloquean
    // estos casos, pero confirmamos antes de calcular.
    if (body.pesoUtilG > body.pesoBrutoG) {
      return NextResponse.json(
        { error: "peso_util_excede_bruto" },
        { status: 400 },
      );
    }

    const mermaCalculadaPct = computeMermaPctFromYield(
      body.pesoBrutoG,
      body.pesoUtilG,
    );

    // Crear el test + actualizar el producto en una sola transacción.
    const [yieldTest, product] = await prisma.$transaction([
      prisma.yieldTest.create({
        data: {
          productId,
          restaurantId: ctx.restaurantId!,
          authorId: ctx.userId,
          pesoBrutoG: body.pesoBrutoG,
          pesoUtilG: body.pesoUtilG,
          mermaCalculadaPct,
          notas: body.notas ?? null,
        },
      }),
      prisma.product.update({
        where: { id: productId },
        data: {
          mermaPct: mermaCalculadaPct,
          mermaOrigen: "medida",
        },
      }),
    ]);

    logger.info("yield_test_created", {
      productId,
      restaurantId: ctx.restaurantId,
      userId: ctx.userId,
      pesoBrutoG: body.pesoBrutoG,
      pesoUtilG: body.pesoUtilG,
      mermaCalculadaPct,
    });

    const recipesUsingCount = await countRecipesUsingProduct(productId);
    return NextResponse.json(
      {
        product: projectProductDetail(product, recipesUsingCount),
        yieldTest: {
          id: yieldTest.id,
          pesoBrutoG: Number(yieldTest.pesoBrutoG),
          pesoUtilG: Number(yieldTest.pesoUtilG),
          mermaCalculadaPct: Number(yieldTest.mermaCalculadaPct),
          notas: yieldTest.notas,
          createdAt: yieldTest.createdAt.toISOString(),
        },
      },
      { status: 201 },
    );
  },
);
