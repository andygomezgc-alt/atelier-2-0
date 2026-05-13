import { NextRequest } from "next/server";
import { prisma } from "@atelier/db";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { TEMPLATES } from "@/lib/pdf/templates";
import { renderHtmlToPdf } from "@/lib/pdf/render";
import { logger } from "@/lib/logger";
import type { ClientOverrides } from "@atelier/shared";

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
      sections: { orderBy: { order: "asc" }, select: { id: true, name: true } },
      items: {
        orderBy: { order: "asc" },
        include: { recipe: { select: { title: true } } },
      },
      clientOverride: { select: { overrides: true } },
    },
  });

  if (!menu || menu.restaurantId !== ctx.restaurantId)
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });

  const style = (styleParam ?? menu.presentationStyle) as keyof typeof TEMPLATES;
  const renderer = TEMPLATES[style] ?? TEMPLATES.elegant;

  // Cliente overrides: JSON validado por Zod arriba; acá lo tratamos como
  // partial deep. Cada campo: override > canonical-staff > fallback.
  const ov = (menu.clientOverride?.overrides ?? {}) as ClientOverrides;

  const dishesBySection = new Map<string | null, Array<{ name: string; description: string; price: number }>>();
  for (const it of menu.items) {
    const sectionKey = it.sectionId ?? null;
    const list = dishesBySection.get(sectionKey) ?? [];
    list.push({
      name: ov.items?.[it.id]?.name ?? it.customName ?? it.recipe?.title ?? "",
      description: ov.items?.[it.id]?.description ?? it.customDesc ?? "",
      price: ov.items?.[it.id]?.price ?? it.price,
    });
    dishesBySection.set(sectionKey, list);
  }

  const sections = menu.sections.map((s) => ({
    name: ov.sections?.[s.id]?.name ?? s.name,
    dishes: dishesBySection.get(s.id) ?? [],
  }));
  const unsectioned = dishesBySection.get(null) ?? [];

  const html = renderer({
    restaurantName: ov.restaurantName ?? menu.restaurant?.name ?? "",
    menuName: ov.menuName ?? menu.name,
    season: ov.subtitle ?? menu.season,
    sections,
    unsectioned,
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
