// "Tu estilo" fiel — el modelo MIRA la carta real y GENERA el theme HTML/CSS
// completo (tipografía, colores, ornamentos, layout) que la replica; los platos
// del restaurante se inyectan como datos (theme-render.ts). Con un bucle de
// refinamiento: imprimimos el PDF real y el modelo compara original vs. copia,
// incluidos sus saltos de página. El refinado vuelve a imprimirse antes de usarlo.
//
// Mismo patrón que style-extract.ts: server-only (clave del server), salida
// JSON estructurado, Zod + sanitizado antes de usar.

import { generateGlmJson } from "../ai/glm";
import { visionParts } from "../ai/media";
import type { AiPart, AiUsage } from "../ai/types";
import {
  MenuCustomThemeSchema,
  type MenuCustomTheme,
  type Allergen,
} from "@atelier/shared";
import { FONT_IDS, FONT_REGISTRY, fontVariants } from "./fonts";
import { MenuFontValidationError } from "./font-validation";
import { sanitizeTheme } from "./theme-sanitize";
import {
  renderGeneratedTheme,
  validateThemeStructure,
  ThemeValidationError,
} from "./theme-render";
import { renderThemePreview, MenuThemePreviewError } from "./theme-preview";
import { themeStressInput, requiredMenuContent } from "./theme-stress-input";
import type { RenderInput } from "./templates";
import { logger } from "../logger";
import { preserveReferencePageSize, referenceGeometryPrompt, uniformReferenceSize, type PdfReferenceGeometry } from "./reference-geometry";

// Esquema enviado como contexto al modo JSON; Zod valida la respuesta recibida.
const FONT_ENUM = FONT_IDS as unknown as string[];
const EMIT_THEME_TOOL = {
  name: "emit_menu_theme",
  description:
    "Emití el theme HTML/CSS completo que replica el diseño de la carta. Es obligatorio llamar a esta herramienta una sola vez.",
  input_schema: {
    type: "object" as const,
    properties: {
      version: { type: "integer", enum: [1], description: "Siempre 1." },
      fontTitle: { type: "string", enum: FONT_ENUM, description: "id de fuente del catálogo para los títulos." },
      fontBody: { type: "string", enum: FONT_ENUM, description: "id de fuente del catálogo para el cuerpo." },
      fontAccent: {
        type: ["string", "null"],
        enum: [...FONT_ENUM, null],
        description: "id de fuente del catálogo para acentos, o null.",
      },
      css: {
        type: "string",
        description:
          "Todo el CSS del theme (clases propias, colores, tipografías, márgenes de página). SIN etiqueta <style>, sin recursos externos, sin @import.",
      },
      frameHtml: {
        type: ["string", "null"],
        description:
          "Marco que envuelve TODO. Si lo usás DEBE contener el placeholder EXACTO {{CONTENT}}; opcionales {{RESTAURANT_NAME}}, {{MENU_NAME}}, {{SEASON_HTML}}. Si no hay marco, null.",
      },
      headerHtml: {
        type: "string",
        description:
          "Encabezado del menú. DEBE contener {{MENU_NAME}} y/o {{RESTAURANT_NAME}}; opcional {{SEASON_HTML}}.",
      },
      sectionHeaderHtml: {
        type: "string",
        description: "Encabezado de cada sección. DEBE contener {{SECTION_NAME}}.",
      },
      sectionHtml: {
        type: ["string", "null"],
        description: "Contenedor completo de cada sección: {{SECTION_HEADER_HTML}} y {{DISHES_HTML}}. Usalo para columnas o grupos; null para flujo simple.",
      },
      dishHtml: {
        type: "string",
        description:
          "Un plato. DEBE contener {{DISH_NAME}} y {{PRICE}}; opcionales {{DISH_DESC}} y {{ALLERGENS_HTML}}.",
      },
      footerHtml: {
        type: ["string", "null"],
        description:
          "Pie opcional (o null). Acepta {{RESTAURANT_NAME}}, {{MENU_NAME}}, {{SEASON_HTML}}.",
      },
    },
    required: [
      "version",
      "fontTitle",
      "fontBody",
      "fontAccent",
      "css",
      "frameHtml",
      "headerHtml",
      "sectionHeaderHtml",
      "dishHtml",
      "footerHtml",
    ],
  },
} as const;

const FONT_CATALOG = FONT_IDS.map(
  (id) => `- ${id}: ${FONT_REGISTRY[id].family} — ${FONT_REGISTRY[id].blurb}. Variantes: ${FONT_REGISTRY[id].files.map(f => `${f.weight} ${f.style}`).join(", ")}.`,
).join("\n");

const CONTRACT = `Vas a emitir un THEME: fragmentos de HTML con placeholders + un bloque de CSS libre. El server inyecta los platos reales del restaurante reemplazando los placeholders y envuelve todo en <html><head><style>…tu css…</style></head><body>…</body></html>.

Fragmentos y sus placeholders (usá EXACTAMENTE estos nombres con dobles llaves):
- headerHtml: encabezado del menú. Placeholders: {{RESTAURANT_NAME}}, {{MENU_NAME}}, {{SEASON_HTML}} (este último ya viene como HTML, un <div class="season"> con la temporada, o vacío).
- sectionHeaderHtml: encabezado de cada sección. Placeholder: {{SECTION_NAME}}.
- sectionHtml (opcional, o null): contenedor de UNA sección completa, con {{SECTION_HEADER_HTML}} y {{DISHES_HTML}} obligatorios. Permite agrupar títulos y platos, usar columnas y separar secciones. No abras contenedores en sectionHeaderHtml para cerrarlos en otro fragmento.
- dishHtml: un plato. Placeholders: {{DISH_NAME}}, {{DISH_DESC}}, {{PRICE}} (texto como "24,00 €", "60,00 € / kg" o "4,00 € a persona"), {{ALLERGENS_HTML}}.
- frameHtml (o null): envuelve TODO el contenido. Placeholder obligatorio: {{CONTENT}}. Opcionalmente acepta {{RESTAURANT_NAME}}, {{MENU_NAME}}, {{SEASON_HTML}}. Usalo también como contenedor de layout aunque no tenga borde; si no hace falta, mandá null.
- footerHtml (o null): pie opcional. Acepta {{RESTAURANT_NAME}}, {{MENU_NAME}}, {{SEASON_HTML}} (ej: repetir el nombre del restaurante en el pie).
- css: TODO el CSS del theme (clases propias que uses en los fragmentos, colores, tipografías, ornamentos, márgenes de página). NO incluyas <style>, el server lo agrega.

⚠️ CRÍTICO: los nombres de los placeholders son EXACTOS, en MAYÚSCULAS con guiones bajos ({{RESTAURANT_NAME}}, {{MENU_NAME}}, {{SEASON_HTML}}, {{SECTION_NAME}}, {{DISH_NAME}}, {{DISH_DESC}}, {{PRICE}}, {{ALLERGENS_HTML}}, {{CONTENT}}, {{SECTION_HEADER_HTML}}, {{DISHES_HTML}}). Cualquier OTRO nombre (camelCase, inventado como {{HEADER}}/{{SECTIONS}}/{{tagline}}/{{date}}) se DESCARTA y tu theme queda VACÍO. NO partas el contenido en {{HEADER}}/{{SECTIONS}}/{{FOOTER}}: el server arma header + secciones + platos + leyenda + footer en ese orden; vos solo definís CADA fragmento y, si usás frameHtml, ponés {{CONTENT}} donde va todo.

Fuentes: fontTitle / fontBody / fontAccent son ids del catálogo (fontAccent puede ser null). En el CSS referí a las familias por su nombre EXACTO del catálogo (ej: font-family: 'Playfair Display', serif;). Solo podés usar esas familias + genéricas (serif/sans-serif/cursive). El server embebe los woff2 de las fuentes que declares.

Ejemplo mínimo (adaptalo al diseño real, no lo copies):
{
  "version": 1,
  "fontTitle": "playfair-display",
  "fontBody": "eb-garamond",
  "fontAccent": null,
  "css": "@page{size:A4;margin:20mm}.menu{color:#2a2520;font-family:'EB Garamond',serif}.menu h1{font-family:'Playfair Display',serif;text-align:center;font-size:30pt}.sect{font-size:13pt;text-transform:uppercase;margin:8mm 0 4mm}.dish{display:flex;justify-content:space-between;gap:8mm;margin-bottom:5mm;break-inside:avoid}.price{white-space:nowrap}",
  "frameHtml": "<main class=\"menu\">{{CONTENT}}</main>",
  "headerHtml": "<h1>{{MENU_NAME}}</h1>{{SEASON_HTML}}",
  "sectionHeaderHtml": "<h2 class=\"sect\">{{SECTION_NAME}}</h2>",
  "sectionHtml": "<section>{{SECTION_HEADER_HTML}}{{DISHES_HTML}}</section>",
  "dishHtml": "<article class=\"dish\"><div>{{DISH_NAME}}<p>{{DISH_DESC}}</p>{{ALLERGENS_HTML}}</div><div class=\"price\">{{PRICE}}</div></article>",
  "footerHtml": null
}
Cada fragmento está equilibrado y se cierra dentro de sí mismo. Usá frameHtml para envolver el menú completo; no abras etiquetas en headerHtml para cerrarlas en footerHtml.`;

const HARD_RULES = `Reglas duras:
- SIN recursos externos (nada de http/https, @import, url() que no sea data:), SIN <script>, SIN <style> dentro de los fragmentos, SIN JS.
- El CSS es libre: definí las clases que quieras y usalas en los fragmentos.
- Debe tolerar un número VARIABLE de secciones y platos y varias páginas. Si la referencia PDF permite inferir el formato de la página interior, conservá tamaño, orientación y proporciones mediante @page; si no puede inferirse, usá A4. Para fotos reconstruí la hoja plana sin perspectiva y usá A4 si su formato no es claro. No afirmes medidas exactas que la referencia no permita deducir. Usá @page para el tamaño/márgenes o padding en el contenedor; evitá alturas fijas que corten texto.
- Los iconos de alérgenos llegan dentro de {{ALLERGENS_HTML}} como <span class="allergen-icons"> con varios <span class="allergen-icon"> (SVG inline). Podés estilar .allergen-icons / .allergen-icon. La LEYENDA de alérgenos al pie la agrega el server (clase .allergen-legend, con .allergen-legend-title / .allergen-legend-list / .allergen-legend-item / .allergen-legend-label) — podés estilarla en tu CSS, no la generes vos.
- No rediseñes ni embellezcas la referencia. Conservá columnas, proporciones, jerarquía, alineación de precios y espacios. En fotos ignorá mesa, sombras y perspectiva: reproducí la carta plana. No inventes logos ni textos fijos del restaurante original; el contenido variable usa placeholders. Usá break-inside:avoid en platos y break-after:avoid en títulos; no ocultes desbordamientos ni fijes alturas de contenido.
- Los cargos de servicio (ej. cubierto) se imprimen al final con el mismo fragmento dishHtml, sin descripción ni alérgenos. {{PRICE}} puede incluir una unidad o "a persona": reservá espacio suficiente, sin una columna estrecha que recorte el sufijo.
- Priorizá FIDELIDAD al diseño de la carta real: tipografías parecidas, colores del papel/tinta/acento, ornamentos (filetes, marcos, versalitas), alineaciones y densidad.`;

const PDF_MULTIPAGE_NOTE = `Revisá todas las páginas interiores: jerarquía, separadores, columnas, continuidad de secciones, leyenda y pie. Una portada distinta no debe sustituir el diseño de los platos. Conservá las diferencias funcionales entre primera página, continuaciones y última página cuando correspondan; usá flujo de impresión, no coordenadas fijas para cada plato.`;

function buildGeneratePrompt(isPdf: boolean, feedback?: string, reference?: PdfReferenceGeometry): string {
  return [
    "Replicá el diseño de esta carta de restaurante como un theme HTML/CSS imprimible, conservando el formato de la referencia cuando sea inferible.",
    ...(isPdf ? [PDF_MULTIPAGE_NOTE] : []),
    ...(reference ? [referenceGeometryPrompt(reference)] : []),
    `Catálogo de fuentes disponibles (usá los ids en fontTitle/fontBody/fontAccent y los nombres de familia en el CSS):\n${FONT_CATALOG}`,
    CONTRACT,
    HARD_RULES,
    ...(feedback
      ? [`Tu intento anterior fue RECHAZADO: ${feedback}\nCorregí el motivo indicado. Usá EXACTAMENTE los placeholders del contrato y solo familias, grosores y cursivas disponibles en el catálogo.`]
      : []),
  ].join("\n\n");
}

const REFINE_PROMPT = `Te paso primero la carta ORIGINAL del restaurante (imagen o PDF) y segundo el PDF REAL IMPRESO de tu theme (con otros platos de muestra). Compará todas las páginas del PDF generado, incluidos cortes y continuación de secciones; emití el theme CORREGIDO completo, acercándolo al original en: tipografías (familia y tamaños), colores (papel, tinta, acento), espaciados y márgenes, ornamentos (filetes, marcos, versalitas), alineaciones y densidad. No reduzcas los platos para forzar una sola página. Respetá el mismo contrato de fragmentos y placeholders. Si ya está muy fiel, devolvé el theme igual.`;

// ───── SAMPLE_INPUT: menú de muestra fijo para el render de refinamiento ─────
const IT_ALLERGEN_LABELS: Record<Allergen, string> = {
  gluten: "Glutine",
  crustaceans: "Crostacei",
  eggs: "Uova",
  fish: "Pesce",
  peanuts: "Arachidi",
  soy: "Soia",
  milk: "Latte",
  tree_nuts: "Frutta a guscio",
  celery: "Sedano",
  mustard: "Senape",
  sesame: "Sesamo",
  sulphites: "Solfiti",
  lupin: "Lupini",
  molluscs: "Molluschi",
};

const SAMPLE_INPUT: RenderInput = {
  restaurantName: "Trattoria di Prova",
  menuName: "Menù della Casa",
  season: "Autunno 2026",
  sections: [
    {
      name: "Antipasti",
      dishes: [
        {
          name: "Vitello tonnato",
          description: "Fesa di vitello, salsa tonnata, capperi di Pantelleria",
          price: 1450,
          allergens: ["fish", "eggs"],
        },
        {
          name: "Burrata pugliese",
          description: "Burrata, pomodorini confit, basilico e olio EVO",
          price: 1200,
          allergens: ["milk"],
        },
      ],
    },
    {
      name: "Primi",
      dishes: [
        {
          name: "Tagliatelle al ragù bianco",
          description: "Pasta fresca all'uovo, ragù bianco di maiale, salvia",
          price: 1600,
          allergens: ["gluten", "eggs"],
        },
        {
          name: "Risotto ai funghi porcini",
          description: "Carnaroli, porcini, burro di malga e Parmigiano 24 mesi",
          price: 1800,
          allergens: ["milk"],
        },
        {
          name: "Gnocchi di patate al pomodoro",
          description: "Gnocchi fatti a mano, pomodoro San Marzano, basilico",
          price: 1300,
          allergens: ["gluten"],
        },
      ],
    },
    {
      name: "Secondi",
      dishes: [
        {
          name: "Brasato al Barolo",
          description: "Guancia di manzo brasata al Barolo, polenta morbida",
          price: 2200,
          allergens: [],
        },
        {
          name: "Branzino in crosta di sale alle erbe mediterranee",
          description: "Branzino intero in crosta di sale, verdure di stagione",
          price: 6000,
          priceSuffix: "/ kg",
          allergens: ["fish"],
        },
        {
          name: "Tagliata di manzo",
          description: "Controfiletto, rucola, scaglie di grana e riduzione balsamica",
          price: 2600,
          allergens: ["milk"],
        },
      ],
    },
  ],
  unsectioned: [],
  serviceCharges: [{ name: "Coperto", description: "", price: 400, priceSuffix: "a persona", allergens: [] }],
  showAllergensInPdf: true,
  allergenLegendTitle: "ALLERGENI",
  allergenLabels: IT_ALLERGEN_LABELS,
};

function parseThemeFromResponse(raw: unknown): MenuCustomTheme {
  const parsed = MenuCustomThemeSchema.safeParse(raw);
  if (!parsed.success)
    throw new Error(
      `Theme generado inválido: ${parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join(", ")}`,
    );
  return sanitizeTheme(parsed.data);
}

// Una generación completa: llamada al modelo + Zod/sanitizado + validación
// estructural de placeholders. `feedback` (opcional) se agrega al prompt en el
// reintento. Lanza ThemeValidationError si el theme no respeta el contrato de
// placeholders; Error normal si es Zod/sanitizado; y el error del SDK si es red.
async function generateAndValidate(
  parts: AiPart[],
  isPdf: boolean,
  options: GenerateMenuThemeOptions,
  feedback?: string,
): Promise<MenuCustomTheme> {
  const raw = await generateGlmJson({ task: "menuTheme", system: buildGeneratePrompt(isPdf, feedback, options.referenceGeometry),
    schema: EMIT_THEME_TOOL.input_schema, content: parts, incompleteCode: "menu_theme_response_incomplete",
    onUsage: usage => reportUsage(usage, options),
  });
  const theme = parseThemeFromResponse(raw);
  theme.css = preserveReferencePageSize(theme.css, options.referenceGeometry);
  validateThemeStructure(theme);
  return theme;
}

export interface GenerateMenuThemeOptions {
  sourceParts?: AiPart[];
  referenceGeometry?: PdfReferenceGeometry;
  onUsage?: (input: number, output: number) => Promise<void> | void;
}

async function reportUsage(usage: AiUsage, options: GenerateMenuThemeOptions): Promise<void> {
  if (!options.onUsage) return;
  try {
    await options.onUsage(usage.inputTokens, usage.outputTokens);
  } catch (err) {
    logger.warn("menu_style_theme_usage_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

const SAMPLE_REQUIRED_TEXT = [
  ...SAMPLE_INPUT.sections.flatMap(section => [section.name, ...section.dishes.map(dish => dish.name)]),
  "14,50 €", "60,00 € / kg", "Coperto", "4,00 € a persona",
];

async function previewTheme(theme: MenuCustomTheme, options: GenerateMenuThemeOptions): Promise<Buffer> {
  const size = uniformReferenceSize(options.referenceGeometry);
  const variants = fontVariants([theme.fontTitle, theme.fontBody, theme.fontAccent]);
  const sample = await renderThemePreview(renderGeneratedTheme(SAMPLE_INPUT, theme), SAMPLE_REQUIRED_TEXT, size, variants);
  // Solo local: esta carta extensa nunca viaja al proveedor ni aumenta tokens.
  const stress = themeStressInput(SAMPLE_INPUT);
  await renderThemePreview(renderGeneratedTheme(stress, theme), requiredMenuContent(stress), size, variants, 12);
  return sample;
}

export async function generateMenuTheme(
  buffer: Uint8Array,
  mimeType: string,
  options: GenerateMenuThemeOptions = {},
): Promise<{ theme: MenuCustomTheme; refined: boolean }> {
  const isPdf = mimeType === "application/pdf";
  const parts = options.sourceParts ?? await visionParts(buffer, mimeType);

  // ── Llamada 1: generar (una reparación de estructura o tipografía) ──
  let themeV1: MenuCustomTheme;
  let samplePdf: Buffer;
  let repaired = false;
  try {
    themeV1 = await generateAndValidate(parts, isPdf, options);
    samplePdf = await previewTheme(themeV1, options);
  } catch (err) {
    if (err instanceof ThemeValidationError || err instanceof MenuFontValidationError || err instanceof MenuThemePreviewError) {
      // El modelo ignoró los placeholders o usó una fuente no disponible.
      // Reintentamos UNA vez con el
      // motivo exacto del rechazo como feedback. Si vuelve a fallar, propaga
      // (el endpoint conserva el estilo anterior si no obtenemos uno válido).
      const feedback = err instanceof MenuThemePreviewError
        ? `${err.message}. El diseño debe imprimir también una carta de 6 secciones y 25 platos, incluidos platos sin sección. No ocultes secciones por posición ni uses alturas fijas; conservá todo el contenido y dejá continuar las páginas.`
        : err.message;
      themeV1 = await generateAndValidate(parts, isPdf, options, feedback);
      samplePdf = await previewTheme(themeV1, options);
      repaired = true;
    } else {
      throw err; // red / Zod / sanitizado → sin retry
    }
  }

  // No aceptar una base que solo cumple placeholders pero no imprime los platos.
  // Presupuesto máximo: 2 llamadas, generación + reparación O refinamiento.
  if (repaired) return { theme: themeV1, refined: false };

  // ── Refinamiento best-effort: PDF de muestra → corrección → PDF validado ──
  try {
    const refine = await generateGlmJson({ task: "menuTheme",
      system: [buildGeneratePrompt(isPdf, undefined, options.referenceGeometry), REFINE_PROMPT, "Theme actual que produjo el PDF (corregí este código):", JSON.stringify(themeV1)].join("\n\n"),
      schema: EMIT_THEME_TOOL.input_schema, incompleteCode: "menu_theme_response_incomplete",
      content: [{ type: "text", text: "DOCUMENTO ORIGINAL:" }, ...parts,
        { type: "text", text: "PDF DE MUESTRA GENERADO:" }, ...await visionParts(samplePdf, "application/pdf")],
      onUsage: usage => reportUsage(usage, options),
    });
    const themeV2 = parseThemeFromResponse(refine);
    themeV2.css = preserveReferencePageSize(themeV2.css, options.referenceGeometry);
    // Validación estructural DENTRO del try: un refinado que rompe el contrato
    // de placeholders cae a v1 en vez de romper el render.
    validateThemeStructure(themeV2);
    await previewTheme(themeV2, options);
    return { theme: themeV2, refined: true };
  } catch (err) {
    // El refine NUNCA tira: si falla, nos quedamos con el theme v1.
    logger.warn("menu_style_theme_refine_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { theme: themeV1, refined: false };
  }
}
