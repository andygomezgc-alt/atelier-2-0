// Banco de productos en CSV (auditoría jul 2026): para no quedar encerrado en
// la app. Separador punto y coma (Excel es/it lo abre sin asistente) + BOM
// UTF-8 (para que Excel respete los acentos). Cada campo va entre comillas con
// escape correcto (" → ""). Incluye activos y borradores; EXCLUYE archivados y
// borrados. Orden: categoría, luego nombre. Sin parámetro de idioma: las
// etiquetas van en español (fuente de la marca).

import { NextRequest } from "next/server";
import { prisma } from "@atelier/db";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { logger } from "@/lib/logger";
import { csvField } from "@/lib/csv";
import { t, type TranslationKey } from "@atelier/i18n";
import { formatEuro } from "@/lib/pdf/format";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // P2-3 (auditoría jul 2026): candado de permiso explícito — export_pdf ya
  // incluye a todos los roles (admin/chef_executive/sous_chef/viewer), así que
  // esto no cambia quién puede exportar; solo centraliza el rechazo de
  // usuarios sin restaurante en requireAuth.
  const ctx = await requireAuth(req, "export_pdf");
  if (isNextResponse(ctx)) return ctx;
  if (!ctx.restaurantId)
    return new Response(JSON.stringify({ error: "Not in a restaurant" }), { status: 403 });

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
      aliases: true,
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    take: 2000,
  });

  const label = (key: string): string => t(key as TranslationKey, "es");

  const headers = [
    "Nombre",
    "Categoría",
    "Unidad de compra",
    "Precio",
    "Merma %",
    "Criticidad",
    "Proveedor",
    "Estado",
    "Aliases",
  ];

  const lines = [headers.map(csvField).join(";")];
  for (const p of products) {
    lines.push(
      [
        p.name,
        label(`category_${p.category}`),
        label(`unit_${p.unidadCompra}`),
        formatEuro(p.precioCompra),
        Number(p.mermaPct).toString().replace(".", ","),
        label(`criticality_${p.criticality}`),
        p.proveedor ?? "",
        label(`estado_producto_${p.estado}`),
        p.aliases.join(" | "),
      ]
        .map(csvField)
        .join(";"),
    );
  }

  // BOM UTF-8 + CRLF (convención CSV que Excel espera).
  const csv = String.fromCharCode(0xfeff) + lines.join("\r\n") + "\r\n";

  logger.info("products_csv_exported", {
    restaurantId: ctx.restaurantId,
    products: products.length,
  });

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="productos.csv"`,
      "Cache-Control": "private, max-age=60",
    },
  });
}
