// POST /api/products/from-raw
//
// Crea un producto a partir de un rawText (línea de ingrediente con cantidad
// pegada al nombre, ej. "500g harina de garbanzos"). Aplica los helpers de
// migración (parser + categorizer + purchase-unit + merma + criticality)
// para que el draft quede limpio sin requerir lógica heurística en el
// cliente.
//
// Sub-paso 6 Bug B fix (Andy 2026-05-17): el editor de recetas (nueva.tsx)
// llamaba a POST /api/products con hardcoded name=rawText, category="otro",
// unidadCompra="unidad". Eso generaba drafts chapuceros — mismo patrón
// que ya arreglamos en migrate.ts. Este endpoint centraliza la creación
// "desde rawText" usando los mismos helpers que migrate.ts.
//
// El POST /api/products original mantiene su contrato (campos explícitos)
// para flujos donde el chef sí quiere control total (pantalla "Nuevo
// producto").
//
// Permiso: edit_recipe (no manage_products) — quien guarda una receta
// puede generar drafts del banco. Los drafts quedan estado=borrador para
// que el chef los revise antes de marcarlos activo.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@atelier/db";
import { withAuth } from "@/lib/with-auth";
import { logger } from "@/lib/logger";
import { projectProductDetail } from "@/lib/products/projections";
import { parseIngredient } from "@/lib/products/parser";
import { categorizeFromName, defaultMermaPct } from "@/lib/products/defaults";
import { defaultPurchaseUnit } from "@/lib/products/purchase-unit";
import { defaultCriticality } from "@/lib/products/criticality";
import { detectPezzaturaFromName } from "@atelier/shared";

export const dynamic = "force-dynamic";

const FromRawRequestSchema = z.object({
  rawText: z.string().min(1).max(500),
});

export const POST = withAuth(
  { permission: "edit_recipe", body: FromRawRequestSchema },
  async (ctx, body) => {
    const parsed = parseIngredient(body.rawText);
    const name = parsed.name || body.rawText.trim();
    const category = categorizeFromName(name);
    const unidadCompra = defaultPurchaseUnit(category, name);
    // Entrega A.5 — auto-detect silencioso: si el name contiene calibre
    // ("Gamberi 15/20", "Ricciola 4-6 kg"), lo persistimos. Si no detecta,
    // queda null y el chef lo carga manual al usar el producto.
    const detectedPezzatura = detectPezzaturaFromName(name, category);

    const product = await prisma.product.create({
      data: {
        restaurantId: ctx.restaurantId!,
        name,
        category,
        unidadCompra,
        precioCompra: 0,
        mermaPct: defaultMermaPct(category),
        mermaOrigen: "sugerida",
        estado: "borrador",
        criticality: defaultCriticality(category, name),
        criticalityManual: false,
        pezzaturaMode: detectedPezzatura?.mode ?? null,
        pezzaturaMin: detectedPezzatura?.min ?? null,
        pezzaturaMax: detectedPezzatura?.max ?? null,
      },
    });

    logger.info("product_created_from_raw", {
      productId: product.id,
      restaurantId: ctx.restaurantId,
      userId: ctx.userId,
      rawText: body.rawText,
      name,
      category,
      unidadCompra,
    });

    return NextResponse.json(projectProductDetail(product), { status: 201 });
  },
);
