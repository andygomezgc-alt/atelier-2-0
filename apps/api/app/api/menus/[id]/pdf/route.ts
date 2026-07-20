import { NextRequest } from "next/server";
import { prisma } from "@atelier/db";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { TEMPLATES, renderCustom } from "@/lib/pdf/templates";
import { renderGeneratedTheme } from "@/lib/pdf/theme-render";
import { renderHtmlToPdf } from "@/lib/pdf/render";
import { computeRecipeAllergens } from "@/lib/products/allergens-recipe";
import { logger } from "@/lib/logger";
import type { ClientOverrides, Allergen } from "@atelier/shared";
import { ALLERGEN_ORDER, MenuStyleSpecSchema, MenuCustomThemeSchema } from "@atelier/shared";
import { t, type Language } from "@atelier/i18n";

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
      // menuStyleSpec (tokens) + menuStyleTheme (theme HTML/CSS "estilo fiel") de
      // la casa, para presentationStyle=custom.
      restaurant: {
        select: {
          name: true,
          languageDefault: true,
          menuStyleSpec: true,
          menuStyleTheme: true,
        },
      },
      sections: { orderBy: { order: "asc" }, select: { id: true, name: true } },
      items: {
        orderBy: { order: "asc" },
        include: {
          // Fase 2 alérgenos — incluir lo necesario para computeRecipeAllergens.
          recipe: {
            select: {
              title: true,
              manualAllergens: true,
              recipeIngredients: {
                select: {
                  productId: true,
                  product: { select: { id: true, allergen: true } },
                },
              },
            },
          },
        },
      },
      clientOverride: { select: { overrides: true } },
    },
  });

  if (!menu || menu.restaurantId !== ctx.restaurantId)
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });

  const style = (styleParam ?? menu.presentationStyle) as string;
  // "Estilo fiel": si el estilo efectivo es custom, se prefiere el theme HTML/CSS
  // generado (menuStyleTheme). Si no valida, se cae al spec de tokens
  // (renderCustom); si tampoco, al fallback elegant. Nunca 500 por dato corrupto.
  type Render = (input: Parameters<typeof renderCustom>[0]) => string;
  let renderer: Render;
  if (style === "custom") {
    const themeParse = MenuCustomThemeSchema.safeParse(menu.restaurant?.menuStyleTheme);
    const specParse = MenuStyleSpecSchema.safeParse(menu.restaurant?.menuStyleSpec);
    if (themeParse.success) {
      const theme = themeParse.data;
      renderer = (input) => renderGeneratedTheme(input, theme);
    } else if (specParse.success) {
      const spec = specParse.data;
      renderer = (input) => renderCustom(input, spec);
    } else {
      renderer = TEMPLATES.elegant;
    }
  } else {
    renderer = TEMPLATES[style as keyof typeof TEMPLATES] ?? TEMPLATES.elegant;
  }

  // Cliente overrides: JSON validado por Zod arriba; acá lo tratamos como
  // partial deep. Cada campo: override > canonical-staff > fallback.
  const ov = (menu.clientOverride?.overrides ?? {}) as ClientOverrides;

  // Fase 2 alérgenos — el template recibe codes Allergen[] por plato (para
  // resolver el icono SVG) + un mapa `allergenLabels` con los labels
  // traducidos para la leyenda al pie. La resolución i18n vive acá porque el
  // template no depende de @atelier/i18n.
  const lang = (menu.restaurant?.languageDefault ?? "es") as Language;
  const allergenLabels = Object.fromEntries(
    ALLERGEN_ORDER.map((a) => [a, t(`allergen_${a}` as const, lang)]),
  ) as Record<Allergen, string>;

  const dishesBySection = new Map<
    string | null,
    Array<{ name: string; description: string; price: number; allergens: Allergen[] }>
  >();
  for (const it of menu.items) {
    const sectionKey = it.sectionId ?? null;
    const list = dishesBySection.get(sectionKey) ?? [];

    const allergensResult = it.recipe
      ? computeRecipeAllergens(
          (it.recipe.recipeIngredients ?? []).map((ing) => ({
            productId: ing.productId,
            product: ing.product ? { allergen: ing.product.allergen } : null,
          })),
          it.recipe.manualAllergens ?? [],
        )
      : { allergens: [] as Allergen[], unlinkedIngredients: 0 };

    list.push({
      name: ov.items?.[it.id]?.name ?? it.customName ?? it.recipe?.title ?? "",
      description: ov.items?.[it.id]?.description ?? it.customDesc ?? "",
      price: ov.items?.[it.id]?.price ?? it.price,
      allergens: allergensResult.allergens,
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
    showAllergensInPdf: menu.showAllergensInPdf,
    allergenLegendTitle: t("menu_allergen_legend_title", lang),
    allergenLabels,
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
