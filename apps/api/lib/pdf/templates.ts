// Three menu templates from brief sec. 9. Each renders the same data
// (restaurant, season, menu name, sections + dishes) in a distinct
// typographic register. All A4, single column, no images, server-side.
//
// Mejora 3: sections grouping + cliente overrides upstream apply name/desc/
// price diffs before this layer; templates just render the final values.
//
// Fase 2 alérgenos:
//   - Cada plato recibe `allergens: Allergen[]` (codes del enum). El template
//     resuelve el icono SVG inline desde un mapping interno. Los labels (para
//     la leyenda al pie) vienen en `allergenLabels` del RenderInput porque
//     i18n vive en el caller.
//   - La leyenda al pie se calcula como UNIÓN de los allergens de los platos
//     visibles (mismo dato fuente que los iconos de cada plato — no diverge).
//   - Layout: body flex column + min-height 100vh → la leyenda queda anclada
//     al fondo de la última página vía `margin-top: auto`. La preview chef
//     y el PDF deben verse iguales conceptualmente.

import type { Allergen, MenuStyleSpec } from "@atelier/shared";

export type Dish = {
  name: string;
  description: string;
  price: number; // cents
  // Codes del enum Allergen. Vacío si el plato no tiene alérgenos o el
  // toggle showAllergensInPdf está OFF (el caller pasa [] para que el theme
  // no rendererice nada).
  allergens: Allergen[];
};

export type Section = {
  name: string;
  dishes: Dish[];
};

export type RenderInput = {
  restaurantName: string;
  menuName: string;
  season: string | null;
  sections: Section[];
  unsectioned: Dish[];
  // Fase 2 alérgenos — si false, ni dish-allergens ni legend se renderean.
  showAllergensInPdf: boolean;
  // "ALÉRGENOS" / "ALLERGENI" / "ALLERGENS" según idioma del restaurante.
  allergenLegendTitle: string;
  // Mapa code → label traducido. Ej. { gluten: "Gluten", milk: "Lácteos", ... }.
  // El caller (route handler) lo resuelve con i18n.
  allergenLabels: Record<Allergen, string>;
};

export type Theme = {
  css: string;
  frame?: (inner: string) => string;
  header: (restaurantName: string, menuName: string, seasonHtml: string) => string;
  sectionHeader: (name: string) => string;
  dish: (d: Dish, priceHtml: string) => string;
  footer?: string;
};

export const PRICE = (cents: number) => `${(cents / 100).toFixed(0)} €`;

const ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
export const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ESCAPE[c] ?? c);

// ───── SVG icons inline por alérgeno ─────
// Line-icon style (stroke #9c8e78, fill none, viewBox 24×24). Coherente con
// los Ionicons que muestra la preview en mobile. Andy decide en checkpoint
// si quiere refinar el set; cambiar un icono = sustituir un <path>.
// Paths conceptualmente equivalentes a los iconos de mobile (AllergenIcon.tsx).
// La app usa @expo/vector-icons (Ionicons + MCI + FA6); el PDF no puede cargar
// fuentes externas (request interception en render.ts bloquea todo lo que no
// sea data:), así que inline SVG simple monocromo. Mismo símbolo conceptual
// en ambos lados — Andy valida la coherencia por screenshot.
const ALLERGEN_SVG_PATHS: Record<Allergen, string> = {
  // ───── 7 cambiados en esta tanda ─────
  // Espiga de trigo: tallo central + granos en pares laterales (equivale a
  // FA6 wheat-awn en mobile).
  gluten:
    '<path d="M12 22V10"/><ellipse cx="9" cy="10" rx="1.4" ry="2.4" transform="rotate(-30 9 10)"/><ellipse cx="15" cy="10" rx="1.4" ry="2.4" transform="rotate(30 15 10)"/><ellipse cx="9" cy="14" rx="1.4" ry="2.4" transform="rotate(-30 9 14)"/><ellipse cx="15" cy="14" rx="1.4" ry="2.4" transform="rotate(30 15 14)"/><ellipse cx="9" cy="18" rx="1.4" ry="2.4" transform="rotate(-30 9 18)"/><ellipse cx="15" cy="18" rx="1.4" ry="2.4" transform="rotate(30 15 18)"/>',
  // Camarón: cuerpo curvado C + antenas (equivale a FA6 shrimp).
  crustaceans:
    '<path d="M17 6c-5 0-9 4-9 9 0 2 1 3 2.5 3"/><path d="M10.5 18l-2-2 3-1"/><path d="M17 6l-1.5-3"/><path d="M19 6l1.5-3"/>',
  // Huevo: óvalo (mantenido — Andy aprobó).
  eggs: '<ellipse cx="12" cy="13" rx="6" ry="8"/>',
  // Pez (mantenido).
  fish: '<path d="M4 12c2-4 6-5 10-5s8 1 10 5c-2 4-6 5-10 5s-8-1-10-5zM4 12L1 8M4 12l-3 4M18 12h.01"/>',
  // Cacahuete: dos óvalos verticales con cintura (equivale a MCI peanut-outline).
  peanuts:
    '<path d="M12 3c-3 0-5 2-5 4 0 1.5 .6 2.5 1.3 3.5C7.4 11.5 6.5 12.8 6.5 14.5 6.5 18 9 21 12 21s5.5-3 5.5-6.5c0-1.7-.9-3-1.8-4 .7-1 1.3-2 1.3-3.5 0-2-2-4-5-4z"/>',
  // Soja: hoja (mantenido — Andy aprobó, ya no choca con apio).
  soy: '<path d="M7 7c-2 2-2 8 0 10 3 3 9 1 10-3 0-3-2-7-5-7-2 0-4 1-5 0z"/>',
  // Botella de leche con gota dentro (equivale a FA6 bottle-droplet).
  milk:
    '<path d="M10 3h4v3l1.2 2H8.8L10 6V3z"/><path d="M8.8 8h6.4l.4 11c.05 1.1-.85 2-1.95 2H10.35c-1.1 0-2-.9-1.95-2L8.8 8z"/><path d="M12 13c0-1.2 1.2-2.5 1.2-2.5s1.2 1.3 1.2 2.5c0 .8-.5 1.4-1.2 1.4s-1.2-.6-1.2-1.4z"/>',
  // Almendra (mantenido — Andy no flaggeó).
  tree_nuts:
    '<path d="M12 3c4 0 7 5 7 9s-3 9-7 9-7-5-7-9 3-9 7-9zM12 3v18"/>',
  // Apio (puerro): tres tallos verticales paralelos con hojitas arriba
  // (equivale a MCI leek). Inconfundible con la hoja única de soja.
  celery:
    '<path d="M9 22V9M12 22V7M15 22V9"/><path d="M9 9c-1-1.5-1.8-3.5-1.3-6"/><path d="M12 7c-.5-1.5-1.8-3-3-4"/><path d="M12 7c.5-1.5 1.8-3 3-4"/><path d="M15 9c1-1.5 1.8-3.5 1.3-6"/>',
  // Frasco de mostaza (mantenido).
  mustard:
    '<path d="M9 4h6v3l1 2v10c0 1-1 2-2 2H10c-1 0-2-1-2-2V9l1-2V4zM9 9h6"/>',
  // Sésamo: 3 semillas (mantenido).
  sesame:
    '<ellipse cx="8" cy="14" rx="2" ry="3"/><ellipse cx="16" cy="14" rx="2" ry="3"/><ellipse cx="12" cy="8" rx="2" ry="3"/>',
  // Copa de vino (mantenido).
  sulphites:
    '<path d="M7 3h10l-1 6c0 3-2 5-4 5s-4-2-4-5L7 3zM12 14v6M9 21h6"/>',
  // Vaina de altramuz con granos dentro (equivale a MCI seed-outline).
  lupin:
    '<path d="M3 12c0-2 1-4 3-4h12c2 0 3 2 3 4s-1 4-3 4H6c-2 0-3-2-3-4z"/><circle cx="7.5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="16.5" cy="12" r="1"/>',
  // Pulpo: cabeza ovalada + 4 tentáculos curvos hacia abajo. Silueta pura
  // sin ojos rellenos (todos los iconos son line-icon stroke gris sin fill;
  // los ojos con `fill="currentColor"` heredaban el color de texto del body
  // y se veían más oscuros que el resto del icono). Inconfundible con
  // shrimp (cuerpo recto curvado C) y fish (silueta de pez con cola).
  molluscs:
    '<ellipse cx="12" cy="8" rx="5" ry="4"/><path d="M8 12c-.5 2-2 4-3 5"/><path d="M10 12c-.5 3-.5 6 0 8"/><path d="M14 12c.5 3 .5 6 0 8"/><path d="M16 12c.5 2 2 4 3 5"/>',
};

const ALLERGEN_ICON_COLOR = "#9c8e78";

export function allergenIconSvg(code: Allergen, size = 16): string {
  const path = ALLERGEN_SVG_PATHS[code];
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${ALLERGEN_ICON_COLOR}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

const SHARED_HEAD = `
<meta charset="utf-8" />
<style>
  @page { size: A4; margin: 28mm 24mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; }
  /* Fase 2 alérgenos — body flex column con min-height de la página A4
     menos los margenes, para que la leyenda al pie quede anclada al fondo
     (no flotando justo después del último plato). */
  body { min-height: calc(297mm - 56mm); display: flex; flex-direction: column; }
</style>
`;

function renderMenu(input: RenderInput, theme: Theme): string {
  const {
    restaurantName,
    menuName,
    season,
    sections,
    unsectioned,
    showAllergensInPdf,
    allergenLegendTitle,
    allergenLabels,
  } = input;
  const seasonHtml = season ? `<div class="season">${escape(season)}</div>` : "";
  const header = theme.header(restaurantName, menuName, seasonHtml);

  // Si el toggle está OFF, vaciamos allergens por plato antes de pasar al
  // theme. Esto centraliza la lógica del filtro — el theme renderiza si tiene
  // datos, ignora si vienen vacíos.
  const filterAllergens = (d: Dish): Dish =>
    showAllergensInPdf ? d : { ...d, allergens: [] };

  // Render each section: header + dishes. If a section has no dishes we
  // hide it (keeping the PDF clean — empty section is a UX bug, not a feature).
  const sectionsHtml = sections
    .filter((s) => s.dishes.length > 0)
    .map(
      (s) =>
        theme.sectionHeader(s.name) +
        s.dishes.map((d) => theme.dish(filterAllergens(d), PRICE(d.price))).join(""),
    )
    .join("");

  // Unsectioned dishes go at the end without a header — matches what the
  // preview shows when items haven't been assigned to a section yet.
  const unsectionedHtml = unsectioned
    .map((d) => theme.dish(filterAllergens(d), PRICE(d.price)))
    .join("");

  // Leyenda al pie — unión de TODOS los alérgenos de los platos visibles del
  // menú. Mismo source de datos que los iconos por plato, dedup por Set: no
  // diverge.
  let legendHtml = "";
  if (showAllergensInPdf) {
    const allDishes: Dish[] = [
      ...sections.flatMap((s) => s.dishes),
      ...unsectioned,
    ];
    const menuAllergens = Array.from(
      new Set(allDishes.flatMap((d) => d.allergens)),
    );
    if (menuAllergens.length > 0) {
      const items = menuAllergens
        .map(
          (a) =>
            `<span class="legend-item">${allergenIconSvg(a, 13)}<span class="legend-label">${escape(allergenLabels[a] ?? a)}</span></span>`,
        )
        .join("");
      legendHtml = `
        <div class="legend">
          <div class="legend-title">${escape(allergenLegendTitle)}</div>
          <div class="legend-list">${items}</div>
        </div>`;
    }
  }

  // El contenido principal (header + secciones + platos) va dentro de
  // .menu-content para que flex 1 lo expanda y la leyenda quede pegada al
  // fondo via margin-top: auto.
  const main = `<div class="menu-content">${header}${sectionsHtml}${unsectionedHtml}</div>`;
  const inner = main + legendHtml + (theme.footer ?? "");
  const body = theme.frame ? theme.frame(inner) : inner;
  return `<!doctype html><html><head>${SHARED_HEAD}${theme.css}</head><body>
    ${body}
  </body></html>`;
}

// CSS común para el bloque de alérgenos por plato y la leyenda al pie.
// .menu-content lleva flex:1 para empujar la leyenda al fondo.
const ALLERGENS_CSS = `
  .menu-content { flex: 1 0 auto; }
  .dish-allergens { display: flex; gap: 3mm; align-items: center; margin-top: 2mm; }
  .dish-allergens svg { display: inline-block; vertical-align: middle; }
  .legend {
    flex: 0 0 auto;
    margin-top: auto;
    padding: 6mm 8mm;
    background: #f3ecdd;
    border-top: 0.4pt solid #d9cdb8;
    text-align: center;
    page-break-inside: avoid;
  }
  .legend-title { font-size: 8.5pt; letter-spacing: 0.16em; color: #8b7a6f; margin-bottom: 3mm; }
  .legend-list { display: flex; flex-wrap: wrap; justify-content: center; gap: 4mm 6mm; font-size: 9pt; color: #6e5e54; }
  .legend-item { display: inline-flex; align-items: center; gap: 1.5mm; }
  .legend-label { line-height: 1; }
`;

const THEME_ELEGANT: Theme = {
  css: `<style>
    body { font-family: 'Iowan Old Style', 'Hoefler Text', 'Times New Roman', serif; color: #2a2520; background: #f9f7f2; }
    h1 { text-align: center; font-style: italic; font-weight: 400; font-size: 32pt; letter-spacing: 0.04em; color: #1a3a3a; margin: 0 0 2mm; }
    .season { text-align: center; font-style: italic; font-size: 11pt; color: #8b7a6f; margin-bottom: 16mm; }
    .rule { width: 24mm; height: 0.5pt; background: #c47e4f; margin: 0 auto 16mm; }
    .sect-h { text-align: center; font-style: italic; font-size: 12pt; letter-spacing: 0.35em; color: #c47e4f; text-transform: uppercase; margin: 12mm 0 8mm; }
    .dish { display: flex; justify-content: space-between; align-items: baseline; gap: 8mm; margin-bottom: 8mm; page-break-inside: avoid; }
    .dish-text { flex: 1; }
    .dish-name { font-style: italic; font-size: 14pt; color: #1a3a3a; margin: 0 0 1.5mm; }
    .dish-desc { font-size: 10pt; color: #4a423b; line-height: 1.5; margin: 0; }
    .dish-price { font-style: italic; font-size: 14pt; color: #c47e4f; flex-shrink: 0; }
    ${ALLERGENS_CSS}
  </style>`,
  header: (_restaurantName, menuName, seasonHtml) => `<h1>${escape(menuName)}</h1>
    ${seasonHtml}
    <div class="rule"></div>
    `,
  sectionHeader: (name) => `<div class="sect-h">${escape(name)}</div>`,
  dish: (d, price) => `
      <div class="dish">
        <div class="dish-text">
          <div class="dish-name">${escape(d.name)}</div>
          ${d.description ? `<div class="dish-desc">${escape(d.description)}</div>` : ""}
          ${d.allergens.length > 0 ? `<div class="dish-allergens">${d.allergens.map((a) => allergenIconSvg(a, 14)).join("")}</div>` : ""}
        </div>
        <div class="dish-price">${price}</div>
      </div>`,
};

const THEME_RUSTIC: Theme = {
  css: `<style>
    body { font-family: 'Iowan Old Style', 'Hoefler Text', Georgia, serif; color: #2a2520; background: #f5f0e6; }
    .frame { border: 1.5pt double #c47e4f; padding: 14mm 12mm; flex: 1; display: flex; flex-direction: column; }
    h1 { text-align: center; font-style: italic; font-weight: 400; font-size: 26pt; color: #2a2520; margin: 0; }
    .underline { width: 36mm; height: 1pt; background: #c47e4f; margin: 4mm auto 4mm; }
    .season { text-align: center; font-size: 10pt; color: #6e5e54; margin-bottom: 14mm; font-variant: small-caps; letter-spacing: 0.2em; }
    .sect-h { text-align: center; font-size: 11pt; letter-spacing: 0.3em; color: #c47e4f; text-transform: uppercase; margin: 10mm 0 6mm; font-variant: small-caps; }
    .dish { margin-bottom: 7mm; padding-bottom: 5mm; border-bottom: 0.4pt dotted #b1a394; page-break-inside: avoid; }
    .dish:last-child { border-bottom: none; }
    .dish-name { font-style: italic; font-size: 13pt; color: #2a2520; margin: 0 0 1.5mm; }
    .dish-desc { font-size: 10pt; color: #4a423b; line-height: 1.6; margin: 0 0 2mm; }
    .dish-price { font-size: 11pt; color: #c47e4f; font-weight: 600; }
    ${ALLERGENS_CSS}
  </style>`,
  frame: (inner) => `<div class="frame">${inner}</div>`,
  header: (_restaurantName, menuName, seasonHtml) => `
      <h1>${escape(menuName)}</h1>
      <div class="underline"></div>
      ${seasonHtml}
      `,
  sectionHeader: (name) => `<div class="sect-h">${escape(name)}</div>`,
  dish: (d, price) => `
        <div class="dish">
          <div class="dish-name">${escape(d.name)}</div>
          ${d.description ? `<div class="dish-desc">${escape(d.description)}</div>` : ""}
          ${d.allergens.length > 0 ? `<div class="dish-allergens">${d.allergens.map((a) => allergenIconSvg(a, 14)).join("")}</div>` : ""}
          <div class="dish-price">${price}</div>
        </div>`,
};

const THEME_MINIMAL: Theme = {
  css: `<style>
    body { font-family: -apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #2a2520; background: #ffffff; font-size: 10.5pt; }
    .head { margin-bottom: 18mm; }
    h1 { font-weight: 300; font-size: 24pt; letter-spacing: -0.01em; color: #1a3a3a; margin: 0 0 2mm; }
    .season { font-size: 10pt; color: #8b7a6f; }
    .sect-h { font-size: 9pt; letter-spacing: 0.35em; color: #1a3a3a; text-transform: uppercase; font-weight: 500; margin: 12mm 0 4mm; }
    .dish { display: grid; grid-template-columns: 1fr auto; gap: 6mm; align-items: baseline; page-break-inside: avoid; margin-bottom: 7mm; }
    .dish-text { display: flex; flex-direction: column; gap: 1.5mm; }
    .dish-name { font-weight: 500; color: #1a3a3a; margin: 0; }
    .dish-desc { font-size: 9.5pt; color: #6e5e54; line-height: 1.5; margin: 0; }
    .dish-price { font-variant-numeric: tabular-nums; color: #c47e4f; font-weight: 500; }
    .rule { height: 0.4pt; background: #e0d8c8; margin: 6mm 0 4mm; }
    ${ALLERGENS_CSS}
  </style>`,
  header: (_restaurantName, menuName, seasonHtml) => `<div class="head">
      <h1>${escape(menuName)}</h1>
      ${seasonHtml}
    </div>
    <div class="rule"></div>
      `,
  sectionHeader: (name) => `<div class="sect-h">${escape(name)}</div>`,
  dish: (d, price) => `
        <div class="dish">
          <div class="dish-text">
            <div class="dish-name">${escape(d.name)}</div>
            ${d.description ? `<div class="dish-desc">${escape(d.description)}</div>` : ""}
            ${d.allergens.length > 0 ? `<div class="dish-allergens">${d.allergens.map((a) => allergenIconSvg(a, 14)).join("")}</div>` : ""}
          </div>
          <div class="dish-price">${price}</div>
        </div>`,
};

// ───── "Tu estilo" — theme builder desde MenuStyleSpec ─────
// El spec (tokens extraídos por IA de la foto de la carta) se convierte acá
// en un Theme completo reusando los patrones de los 3 templates fijos. El
// modelo NUNCA emite HTML/CSS: solo tokens acotados → CSS armado en código
// (el escape() de datos queda intacto, mismo render pipeline).

// Stacks EXISTENTES de los themes fijos — solo system fonts (render.ts
// bloquea cualquier request externa, incluidas webfonts).
const SERIF_STACK = "'Iowan Old Style', 'Hoefler Text', 'Times New Roman', serif";
const SANS_STACK = "-apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif";

// Luminancia relativa WCAG (sRGB → lineal). Base del guard de contraste.
function relativeLuminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const chan = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return (
    0.2126 * chan((n >> 16) & 0xff) +
    0.7152 * chan((n >> 8) & 0xff) +
    0.0722 * chan(n & 0xff)
  );
}

function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// Guard de contraste: el modelo puede leer mal una foto (sombras, papel
// texturado) y emitir tinta casi del color del papel → PDF ilegible. Si el
// ratio bg↔color queda por debajo de ~2.5 (umbral bajo; WCAG pide 3+ hasta
// para texto grande), forzamos una tinta neutra de la casa según la
// luminancia del fondo. Preferimos aproximar la carta con texto legible a
// clavar el color exacto con texto invisible.
function legibleOn(bg: string, color: string): string {
  if (contrastRatio(bg, color) >= 2.5) return color;
  return relativeLuminance(bg) > 0.5 ? "#2a2520" : "#f9f7f2";
}

export function themeFromSpec(spec: MenuStyleSpec): Theme {
  const font = spec.fontCategory === "serif" ? SERIF_STACK : SANS_STACK;
  const bg = spec.bgColor;
  const ink = legibleOn(bg, spec.inkColor);
  const heading = legibleOn(bg, spec.headingColor);
  const accent = spec.accentColor;

  const alignMargin = spec.titleAlign === "center" ? "0 auto" : "0";

  // Divisor bajo el título — variantes de .rule de los themes fijos con el
  // acento del spec. "none" no emite el div en el header.
  const rules: Record<MenuStyleSpec["dividerStyle"], string> = {
    "accent-rule": `.rule { width: 24mm; height: 0.5pt; background: ${accent}; margin: ${alignMargin}; margin-bottom: 14mm; }`,
    "full-hairline": `.rule { height: 0.4pt; background: ${accent}; margin: 6mm 0 10mm; }`,
    underline: `.rule { width: 36mm; height: 1pt; background: ${accent}; margin: ${alignMargin}; margin-bottom: 12mm; }`,
    none: "",
  };

  // Encabezado de sección: uppercase con tracking (como ELEGANT) o
  // versalitas (como RUSTIC). Color: accent — generaliza mejor que heading
  // (en cartas reales el adorno tipográfico suele compartir el acento).
  const sectCase =
    spec.sectionCase === "uppercase"
      ? "text-transform: uppercase; letter-spacing: 0.3em;"
      : "font-variant: small-caps; letter-spacing: 0.25em;";
  const sectAlign = spec.titleAlign === "center" ? "center" : "left";

  // Layout del plato: row = flex de ELEGANT; stack = bloque punteado de
  // RUSTIC; grid = grid de MINIMAL. dish-name en heading, precio en accent.
  const dishCss: Record<MenuStyleSpec["dishLayout"], string> = {
    row: `
    .dish { display: flex; justify-content: space-between; align-items: baseline; gap: 8mm; margin-bottom: 8mm; page-break-inside: avoid; }
    .dish-text { flex: 1; }
    .dish-name { font-size: 13pt; color: ${heading}; margin: 0 0 1.5mm; }
    .dish-desc { font-size: 10pt; color: ${ink}; line-height: 1.5; margin: 0; }
    .dish-price { font-size: 13pt; color: ${accent}; flex-shrink: 0; }`,
    stack: `
    .dish { margin-bottom: 7mm; padding-bottom: 5mm; border-bottom: 0.4pt dotted ${accent}; page-break-inside: avoid; }
    .dish:last-child { border-bottom: none; }
    .dish-text { display: block; }
    .dish-name { font-size: 13pt; color: ${heading}; margin: 0 0 1.5mm; }
    .dish-desc { font-size: 10pt; color: ${ink}; line-height: 1.6; margin: 0 0 2mm; }
    .dish-price { font-size: 11pt; color: ${accent}; font-weight: 600; }`,
    grid: `
    .dish { display: grid; grid-template-columns: 1fr auto; gap: 6mm; align-items: baseline; page-break-inside: avoid; margin-bottom: 7mm; }
    .dish-text { display: flex; flex-direction: column; gap: 1.5mm; }
    .dish-name { font-size: 11pt; font-weight: 500; color: ${heading}; margin: 0; }
    .dish-desc { font-size: 9.5pt; color: ${ink}; line-height: 1.5; margin: 0; }
    .dish-price { font-variant-numeric: tabular-nums; color: ${accent}; font-weight: 500; }`,
  };

  // Marco de página: single = borde fino con el acento; double = como
  // RUSTIC con el acento del spec; none = sin frame.
  const frameCss =
    spec.frame === "none"
      ? ""
      : `.frame { border: ${spec.frame === "double" ? `1.5pt double ${accent}` : `1pt solid ${accent}`}; padding: 14mm 12mm; flex: 1; display: flex; flex-direction: column; }`;

  const css = `<style>
    body { font-family: ${font}; color: ${ink}; background: ${bg}; }
    ${frameCss}
    h1 { text-align: ${spec.titleAlign}; ${spec.titleItalic ? "font-style: italic; " : ""}font-weight: 400; font-size: ${spec.titleSizePt}pt; color: ${heading}; margin: 0 0 2mm; }
    .season { text-align: ${spec.titleAlign}; font-size: 10.5pt; color: ${ink}; margin-bottom: 12mm; }
    ${rules[spec.dividerStyle]}
    .sect-h { text-align: ${sectAlign}; font-size: 11pt; ${sectCase} color: ${accent}; margin: 10mm 0 6mm; }
    ${dishCss[spec.dishLayout]}
    ${ALLERGENS_CSS}
  </style>`;

  return {
    css,
    ...(spec.frame !== "none"
      ? { frame: (inner: string) => `<div class="frame">${inner}</div>` }
      : {}),
    header: (_restaurantName, menuName, seasonHtml) => `<h1>${escape(menuName)}</h1>
      ${seasonHtml}
      ${spec.dividerStyle !== "none" ? '<div class="rule"></div>' : ""}
      `,
    sectionHeader: (name) => `<div class="sect-h">${escape(name)}</div>`,
    // Mismo markup del dish de ELEGANT (dish-text + dish-price hermanos):
    // funciona igual para flex (row), bloque (stack) y grid (columnas).
    dish: (d, price) => `
      <div class="dish">
        <div class="dish-text">
          <div class="dish-name">${escape(d.name)}</div>
          ${d.description ? `<div class="dish-desc">${escape(d.description)}</div>` : ""}
          ${d.allergens.length > 0 ? `<div class="dish-allergens">${d.allergens.map((a) => allergenIconSvg(a, 14)).join("")}</div>` : ""}
        </div>
        <div class="dish-price">${price}</div>
      </div>`,
  };
}

export const renderElegant = (input: RenderInput) => renderMenu(input, THEME_ELEGANT);
export const renderRustic = (input: RenderInput) => renderMenu(input, THEME_RUSTIC);
export const renderMinimal = (input: RenderInput) => renderMenu(input, THEME_MINIMAL);
// "Tu estilo": render con el theme derivado del spec de la casa.
export const renderCustom = (input: RenderInput, spec: MenuStyleSpec) =>
  renderMenu(input, themeFromSpec(spec));

export const TEMPLATES = {
  elegant: renderElegant,
  rustic: renderRustic,
  minimal: renderMinimal,
} as const;
