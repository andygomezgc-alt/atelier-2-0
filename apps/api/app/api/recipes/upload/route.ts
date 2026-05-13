// Receives a PDF or DOCX upload and returns a structured recipe draft
// (title + ingredients/method/notes). Does NOT persist the recipe — the
// client shows the result, lets the user review, then calls POST /api/recipes
// to save the final version.
//
// Routes BYOK-aware (Anthropic/OpenAI/Google) so the user's own provider is
// used for extraction when configured.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { logger } from "@/lib/logger";
import {
  extractRecipeFromFile,
  PDF_MIME,
  DOCX_MIME,
  type ExtractorBYOK,
} from "@/lib/recipe-extraction";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIMES = [PDF_MIME, DOCX_MIME];

export async function POST(req: NextRequest) {
  const ctx = await requireAuth(req, "edit_recipe");
  if (isNextResponse(ctx)) return ctx;

  const form = await req.formData();
  const file = form.get("file");
  if (!file || !(file instanceof Blob))
    return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });

  // Some clients (Expo on Android) send empty/missing mime — accept the form
  // hint from `name`'s extension as a fallback.
  const fileName = file instanceof File ? file.name : "";
  const mime = inferMime(file.type, fileName);
  if (!ALLOWED_MIMES.includes(mime))
    return NextResponse.json(
      { error: "Tipo de archivo no soportado", allowed: ALLOWED_MIMES },
      { status: 415 },
    );

  if (file.size > MAX_BYTES)
    return NextResponse.json(
      { error: "Archivo demasiado grande", max: MAX_BYTES },
      { status: 413 },
    );

  const buffer = new Uint8Array(await file.arrayBuffer());

  const user = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { customProvider: true, customApiKey: true, customModel: true },
  });

  const byok: ExtractorBYOK =
    user?.customProvider && user.customApiKey && user.customModel
      ? {
          provider: user.customProvider as "anthropic" | "openai" | "google",
          apiKey: user.customApiKey,
          model: user.customModel,
        }
      : null;

  const start = Date.now();
  try {
    const extracted = await extractRecipeFromFile(buffer, mime, byok);
    logger.info("recipe_upload_extracted", {
      userId: ctx.userId,
      mime,
      bytes: file.size,
      byok: byok?.provider ?? null,
      latencyMs: Date.now() - start,
    });
    return NextResponse.json({
      title: extracted.title,
      contentJson: {
        ingredients: extracted.ingredients,
        method: extracted.method,
        notes: extracted.notes ?? "",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al procesar archivo";
    logger.error("recipe_upload_failed", {
      userId: ctx.userId,
      mime,
      bytes: file.size,
      byok: byok?.provider ?? null,
      error: message,
    });
    return NextResponse.json({ error: message }, { status: 422 });
  }
}

function inferMime(declared: string, fileName: string): string {
  if (declared && declared !== "application/octet-stream") return declared;
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return PDF_MIME;
  if (lower.endsWith(".docx")) return DOCX_MIME;
  return declared;
}
