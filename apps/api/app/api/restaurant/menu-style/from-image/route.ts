// "Tu estilo" — recibe una IMAGEN o un PDF de la carta real, extrae los
// tokens de estilo con visión (GLM, clave del servidor) y crea una propuesta en
// MenuStyleVersion. Al activarla, el estilo es DE LA CASA: una configuración
// por restaurante; cualquier menú con presentationStyle=custom la usa al
// exportar el PDF.

import { NextRequest, NextResponse } from "next/server";
import { prisma, type Prisma } from "@atelier/db";
import { getDocumentProxy } from "unpdf";
import { visionParts } from "@/lib/ai/media";
import { aiConfig } from "@/lib/ai/config";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { logger } from "@/lib/logger";
import { fileMatchesMime, IMAGE_MIMES, PDF_MIME } from "@/lib/recipe-extraction";
import { extractMenuStyle } from "@/lib/pdf/style-extract";
import { generateMenuTheme } from "@/lib/pdf/theme-generate";
import { deleteBlobs, uploadPhoto } from "@/lib/blob";
import { reserveAiCall, aiQuotaExceededResponse, recordAiTokens } from "@/lib/ai-quota";
import { budgetErrorResponse } from "@/lib/ai/budget-policy";
import { cachedMenuStyle, menuReferenceHash } from "@/lib/pdf/style-cache";
import { readReferenceGeometry, type PdfReferenceGeometry } from "@/lib/pdf/reference-geometry";

export const dynamic = "force-dynamic";
// Visión + generación + refinamiento o reparación: hasta tres llamadas al modelo.
// El refinamiento compara el PDF paginado real producido por Puppeteer.
export const maxDuration = 300;

const ALLOWED_MIMES: readonly string[] = [...IMAGE_MIMES, PDF_MIME];

// Mismo tope que las fotos de recetas: base64 + visión no se disparan.
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
// Mismo tope que /api/recipes/upload para PDFs.
const MAX_PDF_BYTES = 10 * 1024 * 1024;
// Cap de páginas: evita mandar cartas gigantes a visión (costo/latencia) antes
// de siquiera gastar cuota.
const MAX_PDF_PAGES = 10;

export async function POST(req: NextRequest) {
  // Mismo permiso que el PATCH de menús ("edit_menu": admin/chef_executive/
  // sous_chef) — definir el estilo de la casa es parte de editar menús.
  const ctx = await requireAuth(req, "edit_menu");
  if (isNextResponse(ctx)) return ctx;
  if (!ctx.restaurantId)
    return NextResponse.json({ error: "Not in a restaurant" }, { status: 403 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Archivo ilegible", code: "file_invalid" }, { status: 400 });
  }
  const file = form.get("file");
  if (!file || !(file instanceof Blob))
    return NextResponse.json(
      { error: "Falta el archivo", code: "file_invalid" },
      { status: 400 },
    );

  const mime = file.type;
  if (!ALLOWED_MIMES.includes(mime))
    return NextResponse.json(
      { error: "Tipo de archivo no soportado", allowed: ALLOWED_MIMES, code: "file_invalid" },
      { status: 415 },
    );

  const isPdf = mime === PDF_MIME;
  const maxBytes = isPdf ? MAX_PDF_BYTES : MAX_IMAGE_BYTES;
  if (file.size > maxBytes)
    return NextResponse.json(
      { error: "Archivo demasiado grande", max: maxBytes, code: "file_invalid" },
      { status: 413 },
    );

  const buffer = new Uint8Array(await file.arrayBuffer());

  // El contenido real debe coincidir con el MIME declarado (magic bytes).
  if (!fileMatchesMime(buffer, mime))
    return NextResponse.json(
      { error: "El archivo no coincide con su tipo", allowed: ALLOWED_MIMES, code: "file_invalid" },
      { status: 415 },
    );

  // Cap de páginas ANTES de gastar cuota: una carta PDF gigante no debe
  // quemar el límite diario si la vamos a rechazar igual.
  let referenceGeometry: PdfReferenceGeometry | undefined;
  if (isPdf) {
    let numPages: number;
    try {
      // pdf.js DETACHA el typed array que recibe (transfer al worker): tras la
      // llamada `buffer` quedaría vacío. Le pasamos una copia para poder seguir
      // usando `buffer` en extractMenuStyle y uploadPhoto.
      const doc = await getDocumentProxy(new Uint8Array(buffer));
      try {
        numPages = doc.numPages;
        if (numPages < 1) throw new Error("empty_pdf");
        if (numPages >= 1 && numPages <= MAX_PDF_PAGES) referenceGeometry = await readReferenceGeometry(doc);
      } finally {
        await doc.destroy();
      }
    } catch {
      return NextResponse.json(
        { error: "PDF ilegible", code: "file_invalid" },
        { status: 415 },
      );
    }
    if (numPages > MAX_PDF_PAGES)
      return NextResponse.json(
        { error: "PDF con demasiadas páginas", maxPages: MAX_PDF_PAGES, code: "file_invalid" },
        { status: 413 },
      );
  }

  let uploadedRef: string | null = null;
  try {
    const sha256 = menuReferenceHash(buffer);
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: ctx.restaurantId },
      select: { menuStyleSpec: true, menuStyleTheme: true, menuStyleRefUrl: true },
    });
    if (!restaurant) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const previous = await prisma.menuStyleVersion.findFirst({
      where: { restaurantId: ctx.restaurantId, sourceHash: sha256, discardedAt: null },
      orderBy: { createdAt: "desc" },
    });
    const saved = previous && cachedMenuStyle({ menuStyleTheme: previous.theme, menuStyleSpec: previous.spec }, sha256, mime);
    if (previous && saved) return NextResponse.json({ versionId: previous.id, spec: saved.spec, reused: true });
    const legacy = cachedMenuStyle(restaurant, sha256, mime);
    let spec;
    let theme: Prisma.InputJsonValue;
    let refUrl: string | null;
    if (legacy) {
      spec = legacy.spec;
      theme = restaurant.menuStyleTheme as Prisma.InputJsonValue;
      refUrl = restaurant.menuStyleRefUrl;
    } else {
      const quota = await reserveAiCall(ctx.userId);
      if (!quota.ok) return aiQuotaExceededResponse(quota.retryAfter);
      const options = { referenceGeometry, sourceParts: await visionParts(buffer, mime), onUsage: (input: number, output: number) => recordAiTokens(ctx.userId, input, output) };
      spec = await extractMenuStyle(buffer, mime, options);
      const generated = await generateMenuTheme(buffer, mime, options);
      theme = { ...generated.theme, reference: { sha256, mimeType: mime, refined: generated.refined,
        provider: "zai", styleModel: aiConfig("menuStyle").model, themeModel: aiConfig("menuTheme").model } } as Prisma.InputJsonValue;
      try { uploadedRef = await uploadPhoto(Buffer.from(buffer), "menu-style/" + ctx.restaurantId, mime); }
      catch { uploadedRef = null; }
      refUrl = uploadedRef;
    }
    const version = await prisma.menuStyleVersion.create({ data: {
      restaurantId: ctx.restaurantId,
      name: ((file as File).name || "Menu").slice(0, 120),
      spec, theme, refUrl, sourceHash: sha256, mimeType: mime,
    } });
    uploadedRef = null;
    // Cargar NO cambia Restaurant ni ningún menú. La activación es explícita.
    return NextResponse.json({ versionId: version.id, spec, reused: !!legacy });
  } catch (err) {
    const budgetResponse = budgetErrorResponse(err);
    if (budgetResponse) return budgetResponse;
    if (uploadedRef) {
      try {
        const owners = await prisma.menuStyleVersion.count({ where: { restaurantId: ctx.restaurantId, refUrl: uploadedRef } });
        if (!owners) await deleteBlobs([uploadedRef]);
      } catch { /* Ante un commit incierto, conservar el archivo. */ }
    }
    logger.error("menu_style_draft_failed", { restaurantId: ctx.restaurantId, error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "No se pudo preparar la propuesta. El estilo activo no ha cambiado.", code: "menu_style_extraction_failed" }, { status: 422 });
  }
}
