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
import { detectPezzaturaFromName, parsePezzatura } from "@atelier/shared";

export const dynamic = "force-dynamic";

// GET /api/products
// Filtros opcionales (query string): category, criticality, estado,
// mermaOrigen, pendiente_precio (=true → precioCompra=0), q (substring sobre
// name, case insensitive), pezzatura_pendiente (Entrega A.5 Fase 8: sin
// pezzaturaMode + alguna receta lo usa por unidad). Sin filtro state =
// devuelve todos los no-borrados.
export const GET = withAuth({}, async (ctx, _body, req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category") as ProductCategory | null;
  const criticality = searchParams.get("criticality") as Criticality | null;
  const estado = searchParams.get("estado") as ProductState | null;
  const mermaOrigen = searchParams.get("mermaOrigen") as MermaOrigin | null;
  const pendientePrecio = searchParams.get("pendiente_precio") === "true";
  const pezzaturaPendiente =
    searchParams.get("pezzatura_pendiente") === "true";
  const q = searchParams.get("q");
  // Papelera: ?trash=true lista los productos borrados (soft-delete) para
  // poder restaurarlos. El listado normal excluye los borrados.
  const trash = searchParams.get("trash") === "true";

  const where: Prisma.ProductWhereInput = {
    restaurantId: ctx.restaurantId!,
    deletedAt: trash ? { not: null } : null,
  };
  if (category) where.category = category;
  if (criticality) where.criticality = criticality;
  if (estado) where.estado = estado;
  if (mermaOrigen) where.mermaOrigen = mermaOrigen;
  if (pendientePrecio) where.precioCompra = 0;
  if (q) where.name = { contains: q, mode: "insensitive" };
  // Entrega A.5 Fase 8 — productos sin pezzatura cargada que SÍ se usan por
  // unidad en alguna receta. El indicador pasivo en el banco también filtra
  // por el "se usa por unidad" client-side (con resolvePezzaturaMode), pero
  // server-side limitamos a `pezzaturaMode IS NULL` + `tiene RI por unidad`.
  if (pezzaturaPendiente) {
    where.pezzaturaMode = null;
    where.recipeIngredients = {
      some: {
        unit: { in: ["piezas", "unidad"] },
        recipe: { deletedAt: null },
      },
    };
  }

  const products = await prisma.product.findMany({
    where,
    // criticality alta primero, después por nombre. Ayuda a que los críticos
    // pendientes salten a la vista en la pantalla principal. En papelera,
    // los borrados más recientes primero.
    orderBy: trash
      ? [{ deletedAt: "desc" }]
      : [{ criticality: "asc" }, { name: "asc" }],
    take: 500,
    // Select mínimo: exactamente los campos que consume projectProductListItem.
    select: {
      id: true,
      name: true,
      category: true,
      pezzatura: true,
      pezzaturaMode: true,
      pezzaturaMin: true,
      pezzaturaMax: true,
      unidadCompra: true,
      precioCompra: true,
      mermaPct: true,
      mermaOrigen: true,
      criticality: true,
      estado: true,
      precioActualizadoAt: true,
    },
  });

  // Entrega A.5 Fase 8 — count distinct de recetas por producto que lo
  // usan con unit ∈ ("piezas","unidad"). Una sola groupBy en vez de N
  // queries (cada producto va al banco una vez). Solo cuenta sobre los
  // productIds devueltos para no hacer trabajo extra.
  const productIds = products.map((p) => p.id);
  const usageRows =
    productIds.length > 0
      ? await prisma.recipeIngredient.findMany({
          where: {
            productId: { in: productIds },
            unit: { in: ["piezas", "unidad"] },
            recipe: { deletedAt: null },
          },
          select: { productId: true, recipeId: true },
          distinct: ["productId", "recipeId"],
        })
      : [];
  const usedByUnitCount = new Map<string, number>();
  for (const r of usageRows) {
    if (!r.productId) continue;
    usedByUnitCount.set(r.productId, (usedByUnitCount.get(r.productId) ?? 0) + 1);
  }

  return NextResponse.json(
    products.map((p) =>
      projectProductListItem(p, usedByUnitCount.get(p.id) ?? 0),
    ),
  );
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

    // Entrega A.5 — pezzatura estructurada:
    //   - Si el chef mandó pezzaturaInput, parsearlo. Si parsea null → 400.
    //   - Si no mandó nada, correr detect sobre el nombre (silencioso, sin
    //     error si no detecta).
    let pezzaturaMode: "pz_per_kg" | "g_per_piece" | null = null;
    let pezzaturaMin: number | null = null;
    let pezzaturaMax: number | null = null;
    if (body.pezzaturaInput && body.pezzaturaInput.trim() !== "") {
      const parsed = parsePezzatura(body.pezzaturaInput.trim(), body.category, body.name);
      if (!parsed) {
        return NextResponse.json(
          {
            error: "invalid_pezzatura",
            message: `No se pudo interpretar la pezzatura "${body.pezzaturaInput}" para categoría ${body.category}.`,
          },
          { status: 400 },
        );
      }
      pezzaturaMode = parsed.mode;
      pezzaturaMin = parsed.min;
      pezzaturaMax = parsed.max;
    } else {
      const detected = detectPezzaturaFromName(body.name, body.category);
      if (detected) {
        pezzaturaMode = detected.mode;
        pezzaturaMin = detected.min;
        pezzaturaMax = detected.max;
      }
    }

    // Producto + primera fila de histórico de precios en la MISMA transacción:
    // si el insert del histórico falla, el producto tampoco queda a medias.
    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          restaurantId: ctx.restaurantId!,
          name: body.name,
          category: body.category,
          pezzatura: body.pezzatura ?? null,
          pezzaturaMode,
          pezzaturaMin,
          pezzaturaMax,
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

      // Histórico de precios: primera fila en la creación (si tiene precio > 0).
      if (created.precioCompra > 0) {
        await tx.productPriceHistory.create({
          data: {
            productId: created.id,
            authorId: ctx.userId,
            precio: created.precioCompra,
            unidadCompra: created.unidadCompra,
          },
        });
      }

      return created;
    });

    logger.info("product_created", {
      productId: product.id,
      restaurantId: ctx.restaurantId,
      userId: ctx.userId,
      category: product.category,
      criticality: product.criticality,
    });

    return NextResponse.json(projectProductDetail(product), { status: 201 });
  },
);
