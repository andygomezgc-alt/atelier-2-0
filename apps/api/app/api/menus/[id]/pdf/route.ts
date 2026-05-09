import { NextRequest } from "next/server";
import { prisma } from "@atelier/db";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { TEMPLATES } from "@/lib/pdf/templates";
import { renderHtmlToPdf } from "@/lib/pdf/render";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth(req, "export_pdf");
  if (isNextResponse(ctx)) return ctx;
  if (!ctx.restaurantId)
    return new Response(JSON.stringify({ error: "Not in a restaurant" }), { status: 403 });
  const { id } = await params;

  const { searchParams } = new URL(req.url);
  const styleParam = searchParams.get("style");

  const menu = await prisma.menuFolder.findUnique({
    where: { id },
    include: {
      restaurant: { select: { name: true } },
      items: {
        orderBy: { order: "asc" },
        include: { recipe: { select: { title: true } } },
      },
    },
  });

  if (!menu || menu.restaurantId !== ctx.restaurantId)
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });

  const style = (styleParam ?? menu.presentationStyle) as keyof typeof TEMPLATES;
  const renderer = TEMPLATES[style] ?? TEMPLATES.elegant;

  const html = renderer({
    restaurantName: menu.restaurant?.name ?? "",
    menuName: menu.name,
    season: menu.season,
    dishes: menu.items.map((it) => ({
      name: it.customName ?? it.recipe?.title ?? "",
      description: it.customDesc ?? "",
      price: it.price,
    })),
  });

  let pdf: Buffer;
  try {
    pdf = await renderHtmlToPdf(html);
  } catch (err) {
    logger.error("menu_pdf_render_failed", {
      err: err instanceof Error ? err.message : String(err),
      menuId: id,
      style,
    });
    return new Response(JSON.stringify({ error: "PDF render failed" }), { status: 500 });
  }

  logger.info("menu_pdf_rendered", { menuId: id, style, bytes: pdf.byteLength });

  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${encodeURIComponent(menu.name)}.pdf"`,
      "Cache-Control": "private, max-age=60",
    },
  });
}
