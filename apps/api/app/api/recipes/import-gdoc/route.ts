// Importa una receta desde un Google Doc compartido por enlace.
//
// Los Google Docs nativos son "archivos virtuales" en Android: el picker
// del sistema (SAF con CATEGORY_OPENABLE) no puede entregarlos, así que el
// chef pega el enlace y el server descarga el export DOCX público y corre
// la MISMA extracción + matching que el upload de PDF/DOCX.
//
// Requiere que el doc esté compartido "cualquier persona con el enlace" —
// si no, Google responde con el HTML del login en vez del DOCX y
// devolvemos un mensaje accionable.
//
// El bloque de matching está duplicado del upload route a propósito,
// igual que en /api/recipes/extract (CLAUDE.md #3/#7).

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { logger } from "@/lib/logger";
import {
  extractRecipeFromFile,
  DOCX_MIME,
  type ExtractorBYOK,
} from "@/lib/recipe-extraction";
import { parseGDocId, gdocExportUrl } from "@/lib/gdoc";
import { loadUserBYOK } from "@/lib/byok-user";
import { findMatch, type MatchCandidate } from "@/lib/products/matching";
import { parseIngredient } from "@/lib/products/parser";
import { reserveAiCall, aiQuotaExceededResponse } from "@/lib/ai-quota";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024; // 10MB — mismo límite que el upload

export async function POST(req: NextRequest) {
  const ctx = await requireAuth(req, "edit_recipe");
  if (isNextResponse(ctx)) return ctx;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const url =
    typeof (body as { url?: unknown })?.url === "string"
      ? (body as { url: string }).url
      : "";
  const docId = parseGDocId(url);
  if (!docId)
    return NextResponse.json(
      { error: "Enlace de Google Docs no válido" },
      { status: 400 },
    );

  let buffer: Uint8Array;
  try {
    const res = await fetch(gdocExportUrl(docId), { redirect: "follow" });
    const contentType = res.headers.get("content-type") ?? "";
    // Doc privado → Google redirige al login (HTML, status 200).
    if (!res.ok || contentType.includes("text/html")) {
      return NextResponse.json(
        {
          error:
            'No puedo acceder al documento. En Google Docs: Compartir → "Cualquier persona con el enlace".',
        },
        { status: 422 },
      );
    }
    buffer = new Uint8Array(await res.arrayBuffer());
    if (buffer.byteLength > MAX_BYTES)
      return NextResponse.json(
        { error: "Archivo demasiado grande", max: MAX_BYTES },
        { status: 413 },
      );
  } catch {
    return NextResponse.json(
      { error: "No se pudo descargar el documento" },
      { status: 502 },
    );
  }

  const byok: ExtractorBYOK = await loadUserBYOK(ctx.userId);

  // Con clave del server aplica el tope diario; con BYOK (clave del chef) no.
  if (!byok) {
    const quota = await reserveAiCall(ctx.userId);
    if (!quota.ok) return aiQuotaExceededResponse(quota.retryAfter);
  }

  const start = Date.now();
  try {
    const [extracted, productList] = await Promise.all([
      extractRecipeFromFile(buffer, DOCX_MIME, byok),
      ctx.restaurantId
        ? prisma.product.findMany({
            where: {
              restaurantId: ctx.restaurantId,
              deletedAt: null,
              estado: { in: ["activo", "borrador"] },
            },
            select: { id: true, name: true, aliases: true },
          })
        : Promise.resolve([]),
    ]);

    const candidates: MatchCandidate[] = productList.map((p) => ({
      id: p.id,
      name: p.name,
      aliases: p.aliases,
    }));

    const recipeIngredients: Array<{
      rawText: string;
      productId: string | null;
    }> = [];
    const pendingMatches: Array<{
      ingredientIdx: number;
      productId: string;
      productName: string;
    }> = [];

    extracted.ingredients.forEach((rawText, idx) => {
      // Parsear antes de matchear (Bug C fix, igual que el upload route):
      // "200g harina" → matchear sólo "harina" contra el banco.
      const p = parseIngredient(rawText);
      const m = findMatch(p.name || rawText, candidates);
      if (m.level === "exact" && m.productId) {
        recipeIngredients.push({ rawText, productId: m.productId });
      } else if (m.level === "probable" && m.productId && m.productName) {
        recipeIngredients.push({ rawText, productId: null });
        pendingMatches.push({
          ingredientIdx: idx,
          productId: m.productId,
          productName: m.productName,
        });
      } else {
        recipeIngredients.push({ rawText, productId: null });
      }
    });

    logger.info("recipe_import_gdoc", {
      userId: ctx.userId,
      bytes: buffer.byteLength,
      byok: byok?.provider ?? null,
      latencyMs: Date.now() - start,
      ingredients: extracted.ingredients.length,
      exactMatches: recipeIngredients.filter((r) => r.productId !== null).length,
      probableMatches: pendingMatches.length,
    });

    return NextResponse.json({
      title: extracted.title,
      contentJson: {
        ingredients: extracted.ingredients,
        method: extracted.method,
        notes: extracted.notes ?? "",
      },
      recipeIngredients,
      pendingMatches,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Error al procesar el documento";
    logger.error("recipe_import_gdoc_failed", {
      userId: ctx.userId,
      bytes: buffer.byteLength,
      byok: byok?.provider ?? null,
      error: message,
    });
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
