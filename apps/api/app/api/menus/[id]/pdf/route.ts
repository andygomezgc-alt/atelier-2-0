import { NextRequest } from "next/server";
import { prisma } from "@atelier/db";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { TEMPLATES, renderCustom } from "@/lib/pdf/templates";
import { renderGeneratedTheme, validateThemeStructure } from "@/lib/pdf/theme-render";
import { sanitizeTheme } from "@/lib/pdf/theme-sanitize";
import { renderHtmlToPdf } from "@/lib/pdf/render";
import { computeRecipeAllergens } from "@/lib/products/allergens-recipe";
import { logger } from "@/lib/logger";
import { activeMenuItemsWhere } from "@/lib/projections";
import type { ClientOverrides, Allergen } from "@atelier/shared";
import { ALLERGEN_ORDER, MenuStyleSpecSchema, MenuCustomThemeSchema, MenuServiceChargesSchema, can } from "@atelier/shared";
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
  const versionId = searchParams.get("styleVersionId");
  if (versionId && !can(ctx.role, "edit_menu")) return Response.json({ error: "Forbidden", code: "forbidden" }, { status: 403 });

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
        where: activeMenuItemsWhere,
        orderBy: { order: "asc" },
        include: {
          // Fase 2 alérgenos — incluir lo necesario para computeRecipeAllergens.
          recipe: {
            select: {
              title: true,
              contentJson: true,
              manualAllergens: true,
              recipeIngredients: {
                select: {
                  productId: true,
                  product: { select: { id: true, allergen: true, allergens: true, allergensReviewed: true } },
                },
              },
            },
          },
        },
      },
      clientOverride: { select: { overrides: true } },
    },
  });

  if (!menu || menu.restaurantId !== ctx.restaurantId || menu.deletedAt != null)
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });

  const previewVersion = versionId ? await prisma.menuStyleVersion.findFirst({
    where: { id: versionId, restaurantId: ctx.restaurantId, discardedAt: null },
  }) : null;
  if (versionId && !previewVersion) return Response.json({ error: "Not found" }, { status: 404 });
  const style = previewVersion ? "custom" : (styleParam ?? menu.presentationStyle) as string;
  // Una plantilla inválida debe avisar: sustituirla por otra alteraría la carta
  // impresa sin que el chef lo haya elegido. Los estilos antiguos que solo
  // guardaban tokens siguen usando su renderer original.
  type Render = (input: Parameters<typeof renderCustom>[0]) => string;
  let renderer: Render;
  if (style === "custom") {
    const rawTheme = previewVersion ? previewVersion.theme : menu.restaurant?.menuStyleTheme;
    const rawSpec = previewVersion ? previewVersion.spec : menu.restaurant?.menuStyleSpec;
    if (rawTheme == null && rawSpec == null) {
      return Response.json({ error: "Carga un estilo de menú antes de exportar con Tu estilo.", code: "menu_style_not_configured" }, { status: 422 });
    }
    try {
      if (rawTheme != null) {
        const theme = sanitizeTheme(MenuCustomThemeSchema.parse(rawTheme));
        validateThemeStructure(theme);
        renderer = (input) => renderGeneratedTheme(input, theme);
      } else {
        const spec = MenuStyleSpecSchema.parse(rawSpec);
        renderer = (input) => renderCustom(input, spec);
      }
    } catch {
      return Response.json({ error: "La plantilla guardada necesita revisión. Vuelve a cargar el estilo o elige otra plantilla.", code: "menu_style_invalid" }, { status: 422 });
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
    Array<{ name: string; description: string; price: number; priceSuffix?: string; allergens: Allergen[] }>
  >();
  for (const it of menu.items) {
    const sectionKey = it.sectionId ?? null;
    const list = dishesBySection.get(sectionKey) ?? [];

    const allergensResult = it.recipe
      ? computeRecipeAllergens(
          (it.recipe.recipeIngredients ?? []).map((ing) => ({
            productId: ing.productId,
            product: ing.product,
          })),
          it.recipe.manualAllergens ?? [],
          it.recipe.contentJson,
        )
      : { allergens: [] as Allergen[], unlinkedIngredients: 0, allergensComplete: false };

    if (menu.showAllergensInPdf && !allergensResult.allergensComplete) {
      return Response.json({ error: "Allergen information requires review", code: "allergens_incomplete", recipeId: it.recipeId }, { status: 422 });
    }

    list.push({
      name: ov.items?.[it.id]?.name ?? it.customName ?? it.recipe?.title ?? "",
      description: ov.items?.[it.id]?.description ?? it.customDesc ?? "",
      price: ov.items?.[it.id]?.price ?? it.price,
      priceSuffix: it.priceUnit === "kg" ? "/ kg" : undefined,
      allergens: allergensResult.allergens,
    });
    dishesBySection.set(sectionKey, list);
  }

  const sections = menu.sections.map((s) => ({
    name: ov.sections?.[s.id]?.name ?? s.name,
    dishes: dishesBySection.get(s.id) ?? [],
  }));
  const unsectioned = dishesBySection.get(null) ?? [];

  const renderInput: Parameters<typeof renderCustom>[0] = {
    serviceCharges: MenuServiceChargesSchema.parse(menu.serviceCharges ?? []).map(charge => ({
      name: charge.name, price: charge.price, description: "", allergens: [],
      priceSuffix: charge.perPerson ? t("menu_charge_per_person", lang) : undefined,
    })),
    restaurantName: ov.restaurantName ?? menu.restaurant?.name ?? "",
    menuName: ov.menuName ?? menu.name,
    season: ov.subtitle ?? menu.season,
    sections,
    unsectioned,
    showAllergensInPdf: menu.showAllergensInPdf,
    allergenLegendTitle: t("menu_allergen_legend_title", lang),
    allergenLabels,
  };

  // Incluye los errores al cargar fuentes: informar sin imprimir otro diseño.
  let html: string;
  try {
    html = renderer(renderInput);
  } catch (err) {
    logger.error("menu_pdf_theme_render_failed", {
      err: err instanceof Error ? err.message : String(err),
      menuId: id,
      style,
    });
    return Response.json({
      error: "No se pudo generar el PDF con la plantilla elegida.",
      ...(style === "custom" ? { code: "menu_style_invalid" } : {}),
    }, { status: style === "custom" ? 422 : 500 });
  }

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
      // Después de editar platos/precios o cambiar la plantilla, una preview
      // debe mostrar el PDF actual incluso al reutilizar la misma URL.
      "Cache-Control": "private, no-store",
    },
  });
}
