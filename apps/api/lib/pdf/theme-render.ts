// "Tu estilo" fiel — renderiza el theme HTML/CSS generado por el modelo a un
// documento A4 imprimible, inyectando los platos reales del restaurante en los
// fragmentos con placeholders. El modelo aporta la ESTRUCTURA y el ESTILO; el
// server aporta los DATOS (siempre escapados) y las piezas de confianza (fuentes
// embebidas, iconos de alérgenos, leyenda al pie).

import type { Allergen, MenuCustomTheme } from "@atelier/shared";
import { escape, PRICE, allergenIconSvg, type RenderInput, type Dish } from "./templates";
import { fontFaceCss } from "./fonts";

// Error de validación ESTRUCTURAL del theme (placeholders faltantes). Se
// distingue de fallos de red/Zod para decidir si vale la pena reintentar la
// generación con feedback (ver theme-generate.ts).
export class ThemeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ThemeValidationError";
  }
}

// Normaliza un nombre de placeholder para matcheo TOLERANTE: sin espacios, en
// minúsculas y sin guiones bajos. Así "dishName", "DISH_NAME", "dish_name" y
// " Dish Name " colapsan a "dishname". El modelo a veces ignora el case exacto
// del contrato; en vez de romper, rescatamos el placeholder por su nombre lógico.
function normalizeKey(raw: string): string {
  return raw.replace(/\s+/g, "").toLowerCase().replace(/_/g, "");
}

const PLACEHOLDER_RE = /\{\{\s*([^}]*?)\s*\}\}/g;

// Reemplaza {{PLACEHOLDER}} con valores YA listos para insertar (los de datos
// vienen escapados; los de HTML seguro —season, iconos— vienen ya-HTML). Match
// tolerante por nombre normalizado. Cualquier placeholder desconocido (de
// cualquier case) que quede sin reemplazar se ELIMINA. Un solo pase sobre el
// template: el texto insertado NO se re-escanea (dato con "{{x}}" no se interpola).
function interpolate(template: string, values: Record<string, string>): string {
  const lookup = new Map<string, string>();
  for (const [key, val] of Object.entries(values)) lookup.set(normalizeKey(key), val);
  return template.replace(PLACEHOLDER_RE, (_m, inner: string) => {
    return lookup.get(normalizeKey(inner)) ?? "";
  });
}

// Conjunto de placeholders (normalizados) presentes en un fragmento.
function placeholderKeys(html: string): Set<string> {
  const set = new Set<string>();
  for (const m of html.matchAll(PLACEHOLDER_RE)) set.add(normalizeKey(m[1] ?? ""));
  return set;
}

// Validación ESTRUCTURAL: el modelo debe respetar el contrato de placeholders o
// el render sale vacío (bug real: frameHtml sin {{CONTENT}} → marco sin nada).
// Usa la MISMA normalización que interpolate (camelCase cuenta). Los mensajes van
// en español y sirven de feedback para el retry (ver theme-generate.ts).
export function validateThemeStructure(theme: MenuCustomTheme): void {
  const frame = theme.frameHtml?.trim();
  if (frame && !placeholderKeys(frame).has("content")) {
    throw new ThemeValidationError(
      "El frameHtml debe contener el placeholder {{CONTENT}} (envuelve todo el contenido); si no hay marco, mandá frameHtml en null.",
    );
  }
  const header = placeholderKeys(theme.headerHtml);
  if (!header.has("menuname") && !header.has("restaurantname")) {
    throw new ThemeValidationError(
      "El headerHtml debe contener {{MENU_NAME}} o {{RESTAURANT_NAME}}. Placeholders válidos del header: {{RESTAURANT_NAME}}, {{MENU_NAME}}, {{SEASON_HTML}}.",
    );
  }
  if (!placeholderKeys(theme.sectionHeaderHtml).has("sectionname")) {
    throw new ThemeValidationError(
      "El sectionHeaderHtml debe contener {{SECTION_NAME}}.",
    );
  }
  const dish = placeholderKeys(theme.dishHtml);
  if (!dish.has("dishname") || !dish.has("price")) {
    throw new ThemeValidationError(
      "El dishHtml debe contener {{DISH_NAME}} y {{PRICE}}. Placeholders válidos del plato: {{DISH_NAME}}, {{DISH_DESC}}, {{PRICE}}, {{ALLERGENS_HTML}}.",
    );
  }
}

// Iconos inline (SVG ya-seguro) de los alérgenos de un plato. Vacío si no tiene.
// Cada icono va en un <span class="allergen-icon"> dentro de un contenedor
// <span class="allergen-icons"> — ambos estilables por el theme (el prompt de
// generación se lo promete al modelo).
function allergensHtml(allergens: Allergen[]): string {
  if (allergens.length === 0) return "";
  const icons = allergens
    .map((a) => `<span class="allergen-icon">${allergenIconSvg(a, 14)}</span>`)
    .join("");
  return `<span class="allergen-icons">${icons}</span>`;
}

function renderDish(theme: MenuCustomTheme, dish: Dish): string {
  return interpolate(theme.dishHtml, {
    DISH_NAME: escape(dish.name),
    DISH_DESC: dish.description ? escape(dish.description) : "",
    PRICE: PRICE(dish.price),
    ALLERGENS_HTML: allergensHtml(dish.allergens),
  });
}

// Leyenda al pie — la arma el server (misma lógica que templates.ts: unión de los
// alérgenos de los platos visibles, dedup por Set). Clase `allergen-legend`
// estilable por el theme.
function renderLegend(input: RenderInput, allDishes: Dish[]): string {
  if (!input.showAllergensInPdf) return "";
  const menuAllergens = Array.from(new Set(allDishes.flatMap((d) => d.allergens)));
  if (menuAllergens.length === 0) return "";
  const items = menuAllergens
    .map(
      (a) =>
        `<span class="allergen-legend-item">${allergenIconSvg(a, 13)}<span class="allergen-legend-label">${escape(
          input.allergenLabels[a] ?? a,
        )}</span></span>`,
    )
    .join("");
  return `<div class="allergen-legend"><div class="allergen-legend-title">${escape(
    input.allergenLegendTitle,
  )}</div><div class="allergen-legend-list">${items}</div></div>`;
}

// Reset mínimo — el theme.css hace el resto (el modelo controla márgenes con
// @page o padding). -webkit-print-color-adjust: exact para que Chromium imprima
// los fondos de color del theme.
const RESET_CSS = `@page{size:A4;}*{box-sizing:border-box;}html,body{margin:0;padding:0;}body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}`;

export function renderGeneratedTheme(input: RenderInput, theme: MenuCustomTheme): string {
  // Si el toggle está OFF vaciamos los alérgenos por plato (misma centralización
  // que templates.ts).
  const filterAllergens = (d: Dish): Dish =>
    input.showAllergensInPdf ? d : { ...d, allergens: [] };

  const seasonHtml = input.season
    ? `<div class="season">${escape(input.season)}</div>`
    : "";

  const header = interpolate(theme.headerHtml, {
    RESTAURANT_NAME: escape(input.restaurantName),
    MENU_NAME: escape(input.menuName),
    SEASON_HTML: seasonHtml,
  });

  // Secciones con al menos un plato (sección vacía = ruido, se oculta).
  const sectionsHtml = input.sections
    .filter((s) => s.dishes.length > 0)
    .map((s) => {
      const sh = interpolate(theme.sectionHeaderHtml, { SECTION_NAME: escape(s.name) });
      const dishes = s.dishes.map((d) => renderDish(theme, filterAllergens(d))).join("");
      return sh + dishes;
    })
    .join("");

  const unsectionedHtml = input.unsectioned
    .map((d) => renderDish(theme, filterAllergens(d)))
    .join("");

  const allVisibleDishes: Dish[] = [
    ...input.sections.flatMap((s) => s.dishes),
    ...input.unsectioned,
  ];
  const legendHtml = renderLegend(input, allVisibleDishes);
  const footerHtml = theme.footerHtml ?? "";

  const content = header + sectionsHtml + unsectionedHtml + legendHtml + footerHtml;
  // frameHtml envuelve todo vía {{CONTENT}}.
  const body = theme.frameHtml
    ? interpolate(theme.frameHtml, { CONTENT: content })
    : content;

  const faceCss = fontFaceCss([theme.fontTitle, theme.fontBody, theme.fontAccent]);

  return `<!doctype html><html><head><meta charset="utf-8" /><style>${RESET_CSS}
${faceCss}
${theme.css}</style></head><body>${body}</body></html>`;
}
