// Recetario completo en PDF (auditoría jul 2026): todas las recetas NO
// borradas del restaurante en un solo documento compacto y elegante para
// compartir/imprimir. Mismo motor HTML→PDF y estética editorial que la ficha
// individual (recipes/[id]/pdf). El texto de la receta es del chef; solo se
// traducen las etiquetas (Ingredientes / Método / porciones).

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

function formatDate(lang: Language): string {
  const locale = lang === "es" ? "es-ES" : lang === "it" ? "it-IT" : "en-GB";
  try {
    return new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function recipeCard(
  recipe: { title: string; portions: number | null; contentJson: unknown },
  lang: Language,
): string {
  const content = (recipe.contentJson ?? {}) as {
    ingredients?: string[];
    method?: string[];
  };
  const ingredients = (content.ingredients ?? []).filter((x) => x && x.trim());
  const method = (content.method ?? []).filter((x) => x && x.trim());

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

  return `<article class="recipe">
    <h2>${esc(recipe.title)}</h2>
    ${portionsLine}
    <div class="rule"></div>
    ${ingredientsBlock}
    ${methodBlock}
  </article>`;
}

function buildHtml(
  restaurantName: string,
  recipes: { title: string; portions: number | null; contentJson: unknown }[],
  lang: Language,
): string {
  const body = recipes.length
    ? `<main>${recipes.map((r) => recipeCard(r, lang)).join("")}</main>`
    : `<main><p class="empty">${esc(t("pdf_recipebook_empty", lang))}</p></main>`;

  return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    body { font-family: 'Iowan Old Style', 'Hoefler Text', 'Times New Roman', serif; color: #2a2520; background: #f9f7f2; margin: 0; padding: 0; }
    .cover { text-align: center; padding: 90mm 20mm 0; page-break-after: always; }
    .cover-eyebrow { font-size: 11pt; letter-spacing: 0.32em; color: #c47e4f; text-transform: uppercase; margin: 0 0 8mm; }
    .cover-title { font-style: italic; font-weight: 400; font-size: 34pt; color: #1a3a3a; margin: 0 0 6mm; }
    .cover-date { font-style: italic; font-size: 11pt; color: #8b7a6f; }
    main { padding: 22mm 20mm; }
    h2 { font-style: italic; font-weight: 400; font-size: 22pt; color: #1a3a3a; margin: 0 0 2mm; }
    .recipe { break-inside: avoid; margin-bottom: 14mm; }
    .portions { font-style: italic; font-size: 10.5pt; color: #8b7a6f; margin: 0 0 4mm; }
    .rule { width: 22mm; height: 0.5pt; background: #c47e4f; margin: 0 0 6mm; }
    .sect-h { font-size: 10pt; letter-spacing: 0.28em; color: #c47e4f; text-transform: uppercase; margin: 6mm 0 3mm; }
    ul { margin: 0; padding-left: 5mm; }
    li { font-size: 10.5pt; line-height: 1.55; margin-bottom: 0.8mm; }
    ol { margin: 0; padding-left: 6mm; }
    ol li { margin-bottom: 2mm; }
    .empty { font-style: italic; font-size: 12pt; color: #8b7a6f; text-align: center; margin-top: 30mm; }
  </style></head><body>
    <section class="cover">
      <div class="cover-eyebrow">${esc(t("pdf_recipebook_eyebrow", lang))}</div>
      <h1 class="cover-title">${esc(restaurantName)}</h1>
      <div class="cover-date">${esc(formatDate(lang))}</div>
    </section>
    ${body}
  </body></html>`;
}

export async function GET(req: NextRequest) {
  const ctx = await requireAuth(req);
  if (isNextResponse(ctx)) return ctx;
  if (!ctx.restaurantId)
    return new Response(JSON.stringify({ error: "Not in a restaurant" }), { status: 403 });

  const langParam = new URL(req.url).searchParams.get("lang");
  const lang: Language = LANGS.includes(langParam as Language) ? (langParam as Language) : "es";

  const [restaurant, recipes] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { id: ctx.restaurantId },
      select: { name: true },
    }),
    prisma.recipe.findMany({
      where: { restaurantId: ctx.restaurantId, deletedAt: null },
      select: { title: true, portions: true, contentJson: true },
      orderBy: [{ title: "asc" }],
      take: 1000,
    }),
  ]);

  let pdf: Buffer;
  try {
    pdf = await renderHtmlToPdf(buildHtml(restaurant?.name ?? "", recipes, lang));
  } catch (err) {
    logger.error("recipebook_pdf_render_failed", {
      err: err instanceof Error ? err.message : String(err),
      restaurantId: ctx.restaurantId,
    });
    return new Response(JSON.stringify({ error: "PDF render failed" }), { status: 500 });
  }

  logger.info("recipebook_pdf_rendered", {
    restaurantId: ctx.restaurantId,
    recipes: recipes.length,
    bytes: pdf.byteLength,
  });

  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="recetario.pdf"`,
      "Cache-Control": "private, max-age=60",
    },
  });
}
