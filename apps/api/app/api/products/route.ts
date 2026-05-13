import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import type { Prisma } from "@atelier/db";
import {
  CreateProductRequestSchema,
  type CreateProductRequest,
  type Criticality,
  type MermaOrigin,
  type ProductCategory,
  type ProductState,
} from "@atelier/shared";
import { withAuth } from "@/lib/with-auth";
import { logger } from "@/lib/logger";
import {
  projectProductListItem,
  projectProductDetail,
} from "@/lib/products/projections";
import { defaultCriticality } from "@/lib/products/criticality";
import { defaultMermaPct } from "@/lib/products/defaults";

export const dynamic = "force-dynamic";

// GET /api/products
// Filtros opcionales (query string): category, criticality, estado,
// mermaOrigen, pendiente_precio (=true → precioCompra=0), q (substring sobre
// name, case insensitive). Sin filtro state = devuelve todos los no-borrados.
export const GET = withAuth({}, async (ctx, _body, req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category") as ProductCategory | null;
  const criticality = searchParams.get("criticality") as Criticality | null;
  const estado = searchParams.get("estado") as ProductState | null;
  const mermaOrigen = searchParams.get("mermaOrigen") as MermaOrigin | null;
  const pendientePrecio = searchParams.get("pendiente_precio") === "true";
  const q = searchParams.get("q");

  const where: Prisma.ProductWhereInput = {
    restaurantId: ctx.restaurantId!,
    deletedAt: null,
  };
  if (category) where.category = category;
  if (criticality) where.criticality = criticality;
  if (estado) where.estado = estado;
  if (mermaOrigen) where.mermaOrigen = mermaOrigen;
  if (pendientePrecio) where.precioCompra = 0;
  if (q) where.name = { contains: q, mode: "insensitive" };

  const products = await prisma.product.findMany({
    where,
    // criticality alta primero, después por nombre. Ayuda a que los críticos
    // pendientes salten a la vista en la pantalla principal.
    orderBy: [{ criticality: "asc" }, { name: "asc" }],
    take: 500,
  });

  return NextResponse.json(products.map(projectProductListItem));
});

// POST /api/products
// Crea un producto. Si criticality no viene en el body, se auto-asigna por
// defaultCriticality(category, name). criticalityManual = false siempre al
// crear; solo pasa a true si el chef la edita después vía PATCH.
// mermaPct default: tabla por categoría (defaultMermaPct). mermaOrigen
// default: 'sugerida'.
export const POST = withAuth(
  { permission: "manage_products", body: CreateProductRequestSchema },
  async (ctx, body: CreateProductRequest) => {
    const autoCrit = defaultCriticality(body.category, body.name);

    const product = await prisma.product.create({
      data: {
        restaurantId: ctx.restaurantId!,
        name: body.name,
        category: body.category,
        pezzatura: body.pezzatura ?? null,
        unidadCompra: body.unidadCompra,
        precioCompra: body.precioCompra,
        mermaPct: body.mermaPct ?? defaultMermaPct(body.category),
        mermaOrigen: body.mermaOrigen ?? "sugerida",
        proveedor: body.proveedor ?? null,
        notas: body.notas ?? null,
        estado: body.estado ?? "activo",
        aliases: body.aliases ?? [],
        // Si el chef forzó una criticidad en el create (raro), la respetamos
        // y marcamos manual. Si no, usamos el auto-cálculo.
        criticality: body.criticality ?? autoCrit,
        criticalityManual: body.criticality !== undefined,
      },
    });

    logger.info("product_created", {
      productId: product.id,
      restaurantId: ctx.restaurantId,
      userId: ctx.userId,
      category: product.category,
      criticality: product.criticality,
    });

    // Histórico de precios: primera fila en la creación (si tiene precio > 0).
    if (product.precioCompra > 0) {
      await prisma.productPriceHistory.create({
        data: {
          productId: product.id,
          authorId: ctx.userId,
          precio: product.precioCompra,
          unidadCompra: product.unidadCompra,
        },
      });
    }

    return NextResponse.json(projectProductDetail(product), { status: 201 });
  },
);
