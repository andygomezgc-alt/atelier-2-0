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
// Standard format and bank matching live in lib/recipes/extraction-pipeline,
// shared with /extract and /upload.

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { logger } from "@/lib/logger";
import {
  extractRecipeFromFile,
  fileMatchesMime,
  DOCX_MIME,
} from "@/lib/recipe-extraction";
import { parseGDocId, gdocExportUrl } from "@/lib/gdoc";
import { loadMatchCandidates, standardizeExtractedRecipe } from "@/lib/recipes/extraction-pipeline";
import { reserveAiCall, aiQuotaExceededResponse, recordAiTokens } from "@/lib/ai-quota";
import { budgetErrorResponse } from "@/lib/ai/budget-policy";

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
          code: "gdoc_access_denied",
        },
        { status: 422 },
      );
    }
    buffer = new Uint8Array(await res.arrayBuffer());
    if (buffer.byteLength > MAX_BYTES)
      return NextResponse.json(
        { error: "Archivo demasiado grande", max: MAX_BYTES, code: "file_invalid" },
        { status: 413 },
      );
    // Google debería exportar un DOCX (ZIP); si no coincide, no lo mandamos al
    // parser (doc raro, o Google devolvió algo inesperado).
    if (!fileMatchesMime(buffer, DOCX_MIME))
      return NextResponse.json(
        {
          error:
            'No puedo acceder al documento. En Google Docs: Compartir → "Cualquier persona con el enlace".',
          code: "gdoc_access_denied",
        },
        { status: 422 },
      );
  } catch {
    return NextResponse.json(
      { error: "No se pudo descargar el documento" },
      { status: 502 },
    );
  }

  const quota = await reserveAiCall(ctx.userId);
  if (!quota.ok) return aiQuotaExceededResponse(quota.retryAfter);

  const start = Date.now();
  try {
    const [extracted, candidates] = await Promise.all([
      extractRecipeFromFile(buffer, DOCX_MIME, usage => recordAiTokens(ctx.userId, usage.inputTokens, usage.outputTokens).catch(() => undefined)),
      loadMatchCandidates(ctx.restaurantId),
    ]);
    const { response, stats } = standardizeExtractedRecipe(extracted, candidates);

    logger.info("recipe_import_gdoc", {
      userId: ctx.userId,
      bytes: buffer.byteLength,
      latencyMs: Date.now() - start,
      ...stats,
      exactMatches: response.recipeIngredients.filter((r) => r.productId !== null).length,
      probableMatches: response.pendingMatches.length,
    });

    return NextResponse.json(response);
  } catch (err) {
    const budgetResponse = budgetErrorResponse(err);
    if (budgetResponse) return budgetResponse;
    const message =
      err instanceof Error ? err.message : "Error al procesar el documento";
    logger.error("recipe_import_gdoc_failed", {
      userId: ctx.userId,
      bytes: buffer.byteLength,
      error: message,
    });
    return NextResponse.json(
      { error: message, code: "recipe_extraction_failed" },
      { status: 422 },
    );
  }
}
