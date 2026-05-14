// POST /api/products/match
//
// Recibe un array de queries (strings de ingredientes que entró el chef).
// Devuelve, en el mismo orden, un MatchResult por cada uno:
//   exact (distancia 0)    → enlace silencioso, productId pre-cargado
//   probable (distancia 1-3) → el cliente muestra ConfirmMatchSheet
//   none (distancia >3)    → el cliente ofrece "Crear producto borrador"
//
// Fetcheamos una sola vez todos los productos del restaurante (id + name +
// aliases) y comparamos en memoria. El N de productos típico es <500;
// Levenshtein O(a*b) sobre strings cortos es trivial. Si el banco crece a
// miles, hay que migrar a pg_trgm con índice GIN.

import { NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import {
  MatchProductsRequestSchema,
  type MatchProductsRequest,
  type MatchProductsResponse,
} from "@atelier/shared";
import { withAuth } from "@/lib/with-auth";
import { findMatch, type MatchCandidate } from "@/lib/products/matching";

export const dynamic = "force-dynamic";

export const POST = withAuth(
  { permission: "edit_recipe", body: MatchProductsRequestSchema },
  async (ctx, body: MatchProductsRequest) => {
    // Solo productos activos/borrador (los archivados no deberían generar
    // matches automáticos — al chef se le ofrece crear nuevo en su lugar).
    const products = await prisma.product.findMany({
      where: {
        restaurantId: ctx.restaurantId!,
        deletedAt: null,
        estado: { in: ["activo", "borrador"] },
      },
      select: { id: true, name: true, aliases: true },
    });

    const candidates: MatchCandidate[] = products.map((p) => ({
      id: p.id,
      name: p.name,
      aliases: p.aliases,
    }));

    const results = body.queries.map((q) => findMatch(q, candidates));

    const response: MatchProductsResponse = { results };
    return NextResponse.json(response);
  },
);
