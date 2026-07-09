// Ficha PDF de UNA receta (auditoría jul 2026): para dejar impresa en la línea.
// Reusa el mismo motor HTML→PDF que el PDF de menús (lib/pdf/render). Estilo
// editorial "papel" coherente con la app. El texto de la receta es del chef, así
// que solo se traducen las etiquetas (Ingredientes / Método / Nota / porciones).

import { NextRequest } from "next/server";
import { prisma } from "@atelier/db";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { renderHtmlToPdf } from "@/lib/pdf/render";
import { logger } from "@/lib/logger";
import { t, type Language } from "@atelier/i18n";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const LANGS: readonly Language[] = ["es", "it", "en"];

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildHtml(
  recipe: { title: string; portions: number | null; contentJson: unknown },
  lang: Language,
): string {
  const content = (recipe.contentJson ?? {}) as {
    ingredients?: string[];
    method?: string[];
    notes?: string;
  };
  const ingredients = (content.ingredients ?? []).filter((x) => x.trim());
  const method = (content.method ?? []).filter((x) => x.trim());
  const notes = (content.notes ?? "").trim();

  const portionsLine =
    recipe.portions && recipe.portions > 0
      ? `<p class="portions">${esc(t("pdf_portions", lang, { n: recipe.portions }))}</p>`
      : "";
  const ingredientsBlock = ingredients.length
    ? `<div class="sect-h">${esc(t("section_ingredients", lang))}</div><ul>${ingredients
        .map((i) => `<li>${esc(i)}</li>`)
        .join("")}</ul>`
    : "";
  const methodBlock = method.length
    ? `<div class="sect-h">${esc(t("section_method", lang))}</div><ol>${method
        .map((m) => `<li>${esc(m)}</li>`)
        .join("")}</ol>`
    : "";
  const notesBlock = notes
    ? `<div class="sect-h">${esc(t("section_note", lang))}</div><p class="notes">${esc(notes)}</p>`
    : "";

  return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    body { font-family: 'Iowan Old Style', 'Hoefler Text', 'Times New Roman', serif; color: #2a2520; background: #f9f7f2; margin: 0; padding: 22mm 20mm; }
    h1 { font-style: italic; font-weight: 400; font-size: 28pt; color: #1a3a3a; margin: 0 0 2mm; }
    .portions { font-style: italic; font-size: 11pt; color: #8b7a6f; margin: 0 0 6mm; }
    .rule { width: 24mm; height: 0.5pt; background: #c47e4f; margin: 0 0 10mm; }
    .sect-h { font-size: 11pt; letter-spacing: 0.28em; color: #c47e4f; text-transform: uppercase; margin: 9mm 0 4mm; }
    ul { margin: 0; padding-left: 5mm; }
    li { font-size: 11pt; line-height: 1.6; margin-bottom: 1mm; }
    ol { margin: 0; padding-left: 6mm; }
    ol li { margin-bottom: 2.5mm; }
    .notes { font-size: 10.5pt; color: #4a423b; line-height: 1.6; white-space: pre-wrap; }
  </style></head><body>
    <h1>${esc(recipe.title)}</h1>
    ${portionsLine}
    <div class="rule"></div>
    ${ingredientsBlock}
    ${methodBlock}
    ${notesBlock}
  </body></html>`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth(req);
  if (isNextResponse(ctx)) return ctx;
  if (!ctx.restaurantId)
    return new Response(JSON.stringify({ error: "Not in a restaurant" }), { status: 403 });
  const { id } = await params;

  const langParam = new URL(req.url).searchParams.get("lang");
  const lang: Language = LANGS.includes(langParam as Language) ? (langParam as Language) : "es";

  const recipe = await prisma.recipe.findUnique({
    where: { id },
    select: { title: true, portions: true, contentJson: true, restaurantId: true, deletedAt: true },
  });
  if (!recipe || recipe.restaurantId !== ctx.restaurantId || recipe.deletedAt !== null)
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });

  let pdf: Buffer;
  try {
    pdf = await renderHtmlToPdf(buildHtml(recipe, lang));
  } catch (err) {
    logger.error("recipe_pdf_render_failed", {
      err: err instanceof Error ? err.message : String(err),
      recipeId: id,
    });
    return new Response(JSON.stringify({ error: "PDF render failed" }), { status: 500 });
  }

  logger.info("recipe_pdf_rendered", { recipeId: id, bytes: pdf.byteLength });

  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${encodeURIComponent(recipe.title)}.pdf"`,
      "Cache-Control": "private, max-age=60",
    },
  });
}
