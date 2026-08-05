// POST /api/products/match
//
// Recibe un array de queries (strings de ingredientes que entró el chef).
// Devuelve, en el mismo orden, un MatchResult por cada uno:
//   exact (distancia 0)    → enlace silencioso, productId pre-cargado
//   ambiguo                → el banco tiene varios hermanos de la misma
//                            familia ("gambero rosso" ×4) y el query no
//                            distingue: el cliente muestra PickVariantSheet
//                            con `candidates` y el chef elige. Jamás se
//                            adivina (pedido de Andy, jul 2026).
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
import { MATCH_CANDIDATE_SELECT } from "@/lib/products/match-ingredients";
import { parseIngredient } from "@/lib/products/parser";

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
      select: MATCH_CANDIDATE_SELECT,
    });

    const candidates: MatchCandidate[] = products.map((p) => ({
      id: p.id,
      name: p.name,
      aliases: p.aliases,
      precioCompra: p.precioCompra,
      unidadCompra: p.unidadCompra,
    }));

    // Bug C fix (Andy 2026-05-17): el rawText del cliente puede traer la
    // cantidad+unidad pegada al nombre ("500g Pomodorini Gialli del
    // Piennolo"). findMatch compara Levenshtein contra los names limpios
    // del banco, así que parseamos primero y matcheamos contra el nombre
    // limpio. Si el parser no detecta cantidad, parsed.name === q.trim()
    // y el comportamiento es idéntico al anterior. Sin este fix, editar
    // una receta migrada duplicaba todos los productos cuyo rawText incluía
    // cantidad — el matching no los reconocía y se creaban drafts nuevos.
    const results = body.queries.map((q) => {
      const parsed = parseIngredient(q);
      return findMatch(parsed.name || q, candidates);
    });

    const response: MatchProductsResponse = { results };
    return NextResponse.json(response);
  },
);
