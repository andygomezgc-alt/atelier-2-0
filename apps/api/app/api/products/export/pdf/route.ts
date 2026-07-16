// Banco de productos en PDF (auditoría jul 2026): tabla editorial para
// compartir/imprimir el anagrafica de precios. Incluye activos y borradores;
// EXCLUYE archivados y borrados. Orden: categoría, luego nombre. Mismo motor
// HTML→PDF y estética editorial que el resto de PDFs de la marca.

import { NextRequest } from "next/server";
import { prisma } from "@atelier/db";
import type { Prisma } from "@atelier/db";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { renderHtmlToPdf } from "@/lib/pdf/render";
import { logger } from "@/lib/logger";
import { t, type Language, type TranslationKey } from "@atelier/i18n";

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

// Precio en centavos → euros con coma decimal (formato es/it): 3200 → "32,00".
function formatEuro(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
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

type ProductRow = {
  name: string;
  category: string;
  unidadCompra: string;
  precioCompra: number;
  mermaPct: Prisma.Decimal;
  criticality: string;
  proveedor: string | null;
  estado: string;
};

function buildHtml(products: ProductRow[], lang: Language): string {
  const label = (key: string): string => t(key as TranslationKey, lang);

  const header = `<tr>
    <th>${esc(label("pdf_products_col_name"))}</th>
    <th>${esc(label("pdf_products_col_category"))}</th>
    <th>${esc(label("pdf_products_col_unit"))}</th>
    <th class="num">${esc(label("pdf_products_col_price"))}</th>
    <th class="num">${esc(label("pdf_products_col_merma"))}</th>
    <th>${esc(label("pdf_products_col_criticality"))}</th>
    <th>${esc(label("pdf_products_col_supplier"))}</th>
    <th>${esc(label("pdf_products_col_state"))}</th>
  </tr>`;

  const rows = products
    .map(
      (p) => `<tr>
      <td class="name">${esc(p.name)}</td>
      <td>${esc(label(`category_${p.category}`))}</td>
      <td>${esc(label(`unit_${p.unidadCompra}`))}</td>
      <td class="num">${esc(formatEuro(p.precioCompra))}</td>
      <td class="num">${esc(Number(p.mermaPct).toFixed(0))}%</td>
      <td>${esc(label(`criticality_${p.criticality}`))}</td>
      <td>${esc(p.proveedor ?? "—")}</td>
      <td>${esc(label(`estado_producto_${p.estado}`))}</td>
    </tr>`,
    )
    .join("");

  const table = products.length
    ? `<table><thead>${header}</thead><tbody>${rows}</tbody></table>`
    : `<p class="empty">${esc(label("pdf_products_empty"))}</p>`;

  return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    body { font-family: 'Iowan Old Style', 'Hoefler Text', 'Times New Roman', serif; color: #2a2520; background: #f9f7f2; margin: 0; padding: 0; }
    .head { margin-bottom: 8mm; }
    .eyebrow { font-size: 10pt; letter-spacing: 0.3em; color: #c47e4f; text-transform: uppercase; margin: 0 0 2mm; }
    .date { font-style: italic; font-size: 10pt; color: #8b7a6f; }
    table { width: 100%; border-collapse: collapse; }
    thead th { font-size: 8.5pt; letter-spacing: 0.12em; text-transform: uppercase; color: #1a3a3a; text-align: left; padding: 2mm 2mm; border-bottom: 0.75pt solid #c47e4f; }
    tbody td { font-size: 9.5pt; color: #2a2520; padding: 1.8mm 2mm; border-bottom: 0.4pt solid #e3ddd2; vertical-align: top; }
    tbody tr { break-inside: avoid; }
    .num { text-align: right; white-space: nowrap; }
    .name { font-style: italic; color: #1a3a3a; }
    .empty { font-style: italic; font-size: 12pt; color: #8b7a6f; text-align: center; margin-top: 40mm; }
  </style></head><body>
    <div class="head">
      <div class="eyebrow">${esc(label("pdf_products_eyebrow"))}</div>
      <div class="date">${esc(formatDate(lang))}</div>
    </div>
    ${table}
  </body></html>`;
}

export async function GET(req: NextRequest) {
  // P2-3 (auditoría jul 2026): candado de permiso explícito — export_pdf ya
  // incluye a todos los roles (admin/chef_executive/sous_chef/viewer), así que
  // esto no cambia quién puede exportar; solo centraliza el rechazo de
  // usuarios sin restaurante en requireAuth.
  const ctx = await requireAuth(req, "export_pdf");
  if (isNextResponse(ctx)) return ctx;
  if (!ctx.restaurantId)
    return new Response(JSON.stringify({ error: "Not in a restaurant" }), { status: 403 });

  const langParam = new URL(req.url).searchParams.get("lang");
  const lang: Language = LANGS.includes(langParam as Language) ? (langParam as Language) : "es";

  const products = await prisma.product.findMany({
    where: {
      restaurantId: ctx.restaurantId,
      deletedAt: null,
      estado: { not: "archivado" },
    },
    select: {
      name: true,
      category: true,
      unidadCompra: true,
      precioCompra: true,
      mermaPct: true,
      criticality: true,
      proveedor: true,
      estado: true,
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    take: 2000,
  });

  let pdf: Buffer;
  try {
    pdf = await renderHtmlToPdf(buildHtml(products, lang));
  } catch (err) {
    logger.error("products_pdf_render_failed", {
      err: err instanceof Error ? err.message : String(err),
      restaurantId: ctx.restaurantId,
    });
    return new Response(JSON.stringify({ error: "PDF render failed" }), { status: 500 });
  }

  logger.info("products_pdf_rendered", {
    restaurantId: ctx.restaurantId,
    products: products.length,
    bytes: pdf.byteLength,
  });

  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="productos.pdf"`,
      "Cache-Control": "private, max-age=60",
    },
  });
}
