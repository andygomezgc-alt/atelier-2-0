import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import {
  PatchProductRequestSchema,
  type PatchProductRequest,
} from "@atelier/shared";
import { withAuth } from "@/lib/with-auth";
import { logger } from "@/lib/logger";
import { projectProductDetail } from "@/lib/products/projections";
import { defaultCriticality } from "@/lib/products/criticality";

export const dynamic = "force-dynamic";

// GET /api/products/:id
export const GET = withAuth({}, async (ctx, _body, req: NextRequest) => {
  const id = req.nextUrl.pathname.split("/").at(-1)!;

  const product = await prisma.product.findUnique({ where: { id } });
  if (
    !product ||
    product.restaurantId !== ctx.restaurantId ||
    product.deletedAt !== null
  )
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(projectProductDetail(product));
});

// PATCH /api/products/:id
//
// Lógica de criticidad (acá vive el bicho importante):
//   1. Si patch.criticality está explícito → set + criticalityManual=true
//   2. Si patch.criticalityManual=false → reset a auto, recomputar
//   3. Si patch.category o patch.name cambian Y criticalityManual=false
//      actualmente → recomputar auto
//   4. Caso default → no tocar criticidad
//
// Si patch.precioCompra cambia, actualizamos precioActualizadoAt y agregamos
// fila a ProductPriceHistory.
//
// Si patch.mermaPct cambia y mermaOrigen no viene explícito en el patch,
// asumimos que el chef la está confirmando manualmente y seteamos
// mermaOrigen='confirmada'. Si el chef quiere mantenerla como 'sugerida'
// puede mandar mermaOrigen explícito en el mismo patch.
export const PATCH = withAuth(
  {
    permission: "manage_products",
    body: PatchProductRequestSchema,
  },
  async (ctx, body: PatchProductRequest, req: NextRequest) => {
    const id = req.nextUrl.pathname.split("/").at(-1)!;

    const existing = await prisma.product.findUnique({ where: { id } });
    if (
      !existing ||
      existing.restaurantId !== ctx.restaurantId ||
      existing.deletedAt !== null
    )
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Lógica de criticidad (ver arriba).
    const nextCategory = body.category ?? existing.category;
    const nextName = body.name ?? existing.name;
    let nextCriticality = existing.criticality;
    let nextCriticalityManual = existing.criticalityManual;

    if (body.criticality !== undefined) {
      // Override explícito por el chef.
      nextCriticality = body.criticality;
      nextCriticalityManual = true;
    } else if (body.criticalityManual === false) {
      // Reset explícito a auto.
      nextCriticality = defaultCriticality(nextCategory, nextName);
      nextCriticalityManual = false;
    } else if (
      (body.category !== undefined || body.name !== undefined) &&
      !existing.criticalityManual
    ) {
      // Cambió category o name y la criticidad no está manualmente fijada
      // → recomputar.
      nextCriticality = defaultCriticality(nextCategory, nextName);
      // criticalityManual sigue false.
    }

    // Lógica de mermaOrigen: si el chef cambió mermaPct sin especificar
    // origen, asumimos confirmación manual.
    const mermaChanged =
      body.mermaPct !== undefined && Number(body.mermaPct) !== Number(existing.mermaPct);
    const nextMermaOrigen =
      body.mermaOrigen ??
      (mermaChanged ? "confirmada" : existing.mermaOrigen);

    // Lógica de precio: si cambió, actualizar precioActualizadoAt y añadir
    // fila al historial.
    const priceChanged =
      body.precioCompra !== undefined && body.precioCompra !== existing.precioCompra;

    const updated = await prisma.product.update({
      where: { id },
      data: {
        name: body.name ?? undefined,
        category: body.category ?? undefined,
        pezzatura: body.pezzatura === undefined ? undefined : body.pezzatura,
        unidadCompra: body.unidadCompra ?? undefined,
        precioCompra: body.precioCompra ?? undefined,
        precioActualizadoAt: priceChanged ? new Date() : undefined,
        mermaPct: body.mermaPct ?? undefined,
        mermaOrigen: nextMermaOrigen,
        proveedor: body.proveedor === undefined ? undefined : body.proveedor,
        notas: body.notas === undefined ? undefined : body.notas,
        estado: body.estado ?? undefined,
        aliases: body.aliases ?? undefined,
        criticality: nextCriticality,
        criticalityManual: nextCriticalityManual,
      },
    });

    if (priceChanged) {
      await prisma.productPriceHistory.create({
        data: {
          productId: id,
          authorId: ctx.userId,
          precio: body.precioCompra!,
          unidadCompra: updated.unidadCompra,
        },
      });
    }

    logger.info("product_updated", {
      productId: id,
      restaurantId: ctx.restaurantId,
      userId: ctx.userId,
      fields: Object.keys(body),
      priceChanged,
      criticalityRecomputed:
        nextCriticality !== existing.criticality && body.criticality === undefined,
    });

    return NextResponse.json(projectProductDetail(updated));
  },
);

// DELETE /api/products/:id
//
// Soft delete (set deletedAt). Si el producto está enlazado a alguna receta
// vía RecipeIngredient, devolvemos 409 con la lista de recetas, salvo que
// venga ?force=true (el cliente lo manda después de mostrar al chef la
// lista y obtener su confirmación).
//
// Cuando el producto se archiva (estado='archivado') las recetas siguen
// referenciándolo y se marcan visualmente como "necesitan revisión" en
// el frontend (no se hace acá).
export const DELETE = withAuth(
  { permission: "manage_products" },
  async (ctx, _body, req: NextRequest) => {
    const id = req.nextUrl.pathname.split("/").at(-1)!;
    const force = req.nextUrl.searchParams.get("force") === "true";

    const existing = await prisma.product.findUnique({ where: { id } });
    if (
      !existing ||
      existing.restaurantId !== ctx.restaurantId ||
      existing.deletedAt !== null
    )
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (!force) {
      const usages = await prisma.recipeIngredient.findMany({
        where: { productId: id },
        select: {
          recipe: { select: { id: true, title: true } },
        },
        take: 50,
      });

      if (usages.length > 0) {
        return NextResponse.json(
          {
            error: "product_in_use",
            // Dedupe — un producto puede aparecer 2+ veces en la misma receta.
            recipes: Array.from(
              new Map(usages.map((u) => [u.recipe.id, u.recipe])).values(),
            ),
          },
          { status: 409 },
        );
      }
    }

    await prisma.product.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    logger.info("product_deleted", {
      productId: id,
      restaurantId: ctx.restaurantId,
      userId: ctx.userId,
      force,
    });

    return NextResponse.json({ ok: true });
  },
);
