// "Tu estilo" — recibe la FOTO de la carta real, extrae los tokens de estilo
// con visión (Sonnet, server key) y los persiste en Restaurant.menuStyleSpec.
// El estilo es DE LA CASA: una sola configuración por restaurante; cualquier
// menú con presentationStyle=custom la usa al exportar el PDF.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { logger } from "@/lib/logger";
import { fileMatchesMime, IMAGE_MIMES } from "@/lib/recipe-extraction";
import { extractMenuStyleFromImage } from "@/lib/pdf/style-extract";
import { uploadPhoto } from "@/lib/blob";
import { reserveAiCall, aiQuotaExceededResponse } from "@/lib/ai-quota";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Mismo tope que las fotos de recetas: base64 + visión no se disparan.
const MAX_BYTES = 6 * 1024 * 1024;

export async function POST(req: NextRequest) {
  // Mismo permiso que el PATCH de menús ("edit_menu": admin/chef_executive/
  // sous_chef) — definir el estilo de la casa es parte de editar menús.
  const ctx = await requireAuth(req, "edit_menu");
  if (isNextResponse(ctx)) return ctx;
  if (!ctx.restaurantId)
    return NextResponse.json({ error: "Not in a restaurant" }, { status: 403 });

  const form = await req.formData();
  const file = form.get("file");
  if (!file || !(file instanceof Blob))
    return NextResponse.json(
      { error: "Falta el archivo", code: "file_invalid" },
      { status: 400 },
    );

  const mime = file.type;
  if (!(IMAGE_MIMES as readonly string[]).includes(mime))
    return NextResponse.json(
      { error: "Tipo de archivo no soportado", allowed: IMAGE_MIMES, code: "file_invalid" },
      { status: 415 },
    );

  if (file.size > MAX_BYTES)
    return NextResponse.json(
      { error: "Archivo demasiado grande", max: MAX_BYTES, code: "file_invalid" },
      { status: 413 },
    );

  const buffer = new Uint8Array(await file.arrayBuffer());

  // El contenido real debe coincidir con el MIME declarado (magic bytes).
  if (!fileMatchesMime(buffer, mime))
    return NextResponse.json(
      { error: "El archivo no coincide con su tipo", allowed: IMAGE_MIMES, code: "file_invalid" },
      { status: 415 },
    );

  // La visión va SIEMPRE con la clave del server (sin BYOK) → cuota SIEMPRE.
  const quota = await reserveAiCall(ctx.userId);
  if (!quota.ok) return aiQuotaExceededResponse(quota.retryAfter);

  const start = Date.now();
  try {
    const spec = await extractMenuStyleFromImage(buffer, mime);

    // Foto de referencia BEST-EFFORT: sin token de Blob devuelve null y si
    // falla la subida seguimos igual — el spec es lo que importa.
    let refUrl: string | null = null;
    try {
      refUrl = await uploadPhoto(Buffer.from(buffer), "menu-style/" + ctx.restaurantId, mime);
    } catch {
      refUrl = null;
    }

    await prisma.restaurant.update({
      where: { id: ctx.restaurantId },
      data: { menuStyleSpec: spec, ...(refUrl ? { menuStyleRefUrl: refUrl } : {}) },
    });

    logger.info("menu_style_extracted", {
      userId: ctx.userId,
      restaurantId: ctx.restaurantId,
      latencyMs: Date.now() - start,
      hasRefUrl: !!refUrl,
    });
    return NextResponse.json({ spec });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al procesar la foto";
    logger.error("menu_style_extract_failed", {
      userId: ctx.userId,
      restaurantId: ctx.restaurantId,
      error: message,
    });
    // Reusamos el code EXISTENTE `recipe_extraction_failed` a propósito: un
    // code nuevo obliga a tocar i18n + mobile en 4 lugares y el toast
    // genérico de extracción alcanza para v1.
    return NextResponse.json(
      { error: message, code: "recipe_extraction_failed" },
      { status: 422 },
    );
  }
}
