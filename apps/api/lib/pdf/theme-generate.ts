// "Tu estilo" fiel — el modelo MIRA la carta real y GENERA el theme HTML/CSS
// completo (tipografía, colores, ornamentos, layout) que la replica; los platos
// del restaurante se inyectan como datos (theme-render.ts). Con un bucle de
// refinamiento: renderizamos el theme generado a PNG y el modelo compara original
// vs. copia y corrige una vez (best-effort).
//
// Mismo patrón que style-extract.ts: server-only (clave del server), tool use
// FORZADO para garantizar JSON parseable, y Zod + sanitizado antes de usar.

import Anthropic from "@anthropic-ai/sdk";
import {
  MenuCustomThemeSchema,
  type MenuCustomTheme,
  type Allergen,
} from "@atelier/shared";
import { FONT_IDS, FONT_REGISTRY } from "./fonts";
import { sanitizeTheme } from "./theme-sanitize";
import {
  renderGeneratedTheme,
  validateThemeStructure,
  ThemeValidationError,
} from "./theme-render";
import { renderHtmlToPng } from "./render";
import type { RenderInput } from "./templates";
import { logger } from "../logger";

// input_schema espejo de MenuCustomThemeSchema — el tool use fuerza la forma y el
// Zod de abajo la garantiza de verdad.
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
  (id) => `- ${id}: ${FONT_REGISTRY[id].family} — ${FONT_REGISTRY[id].blurb}`,
).join("\n");

const CONTRACT = `Vas a emitir un THEME: fragmentos de HTML con placeholders + un bloque de CSS libre. El server inyecta los platos reales del restaurante reemplazando los placeholders y envuelve todo en <html><head><style>…tu css…</style></head><body>…</body></html>.

Fragmentos y sus placeholders (usá EXACTAMENTE estos nombres con dobles llaves):
- headerHtml: encabezado del menú. Placeholders: {{RESTAURANT_NAME}}, {{MENU_NAME}}, {{SEASON_HTML}} (este último ya viene como HTML, un <div class="season"> con la temporada, o vacío).
- sectionHeaderHtml: encabezado de cada sección. Placeholder: {{SECTION_NAME}}.
- dishHtml: un plato. Placeholders: {{DISH_NAME}}, {{DISH_DESC}}, {{PRICE}} (texto tipo "24 €"), {{ALLERGENS_HTML}}.
- frameHtml (o null): envuelve TODO el contenido. Placeholder obligatorio: {{CONTENT}}. Opcionalmente acepta {{RESTAURANT_NAME}}, {{MENU_NAME}}, {{SEASON_HTML}}. Usalo solo si la carta tiene un marco/borde de página; si no, mandá null.
- footerHtml (o null): pie opcional. Acepta {{RESTAURANT_NAME}}, {{MENU_NAME}}, {{SEASON_HTML}} (ej: repetir el nombre del restaurante en el pie).
- css: TODO el CSS del theme (clases propias que uses en los fragmentos, colores, tipografías, ornamentos, márgenes de página). NO incluyas <style>, el server lo agrega.

⚠️ CRÍTICO: los nombres de los placeholders son EXACTOS, en MAYÚSCULAS con guiones bajos ({{RESTAURANT_NAME}}, {{MENU_NAME}}, {{SEASON_HTML}}, {{SECTION_NAME}}, {{DISH_NAME}}, {{DISH_DESC}}, {{PRICE}}, {{ALLERGENS_HTML}}, {{CONTENT}}). Cualquier OTRO nombre (camelCase, inventado como {{HEADER}}/{{SECTIONS}}/{{tagline}}/{{date}}) se DESCARTA y tu theme queda VACÍO. NO partas el contenido en {{HEADER}}/{{SECTIONS}}/{{FOOTER}}: el server arma header + secciones + platos + leyenda + footer en ese orden; vos solo definís CADA fragmento y, si usás frameHtml, ponés {{CONTENT}} donde va todo.

Fuentes: fontTitle / fontBody / fontAccent son ids del catálogo (fontAccent puede ser null). En el CSS referí a las familias por su nombre EXACTO del catálogo (ej: font-family: 'Playfair Display', serif;). Solo podés usar esas familias + genéricas (serif/sans-serif/cursive). El server embebe los woff2 de las fuentes que declares.

Ejemplo mínimo (adaptalo al diseño real, no lo copies):
{
  "version": 1,
  "fontTitle": "playfair-display",
  "fontBody": "eb-garamond",
  "fontAccent": null,
  "css": ".menu{padding:24mm;background:#faf7f0;color:#2a2520;font-family:'EB Garamond',serif} .menu h1{font-family:'Playfair Display',serif;text-align:center;font-size:30pt;margin:0} .sect{font-size:13pt;letter-spacing:.3em;text-transform:uppercase;margin:10mm 0 5mm;color:#8a6a3a} .dish{display:flex;justify-content:space-between;gap:8mm;margin-bottom:6mm} .dish .price{color:#8a6a3a} .season{text-align:center;font-style:italic;color:#8b7a6f;margin-bottom:8mm}",
  "frameHtml": null,
  "headerHtml": "<div class=\\"menu\\"><h1>{{MENU_NAME}}</h1>{{SEASON_HTML}}",
  "sectionHeaderHtml": "<div class=\\"sect\\">{{SECTION_NAME}}</div>",
  "dishHtml": "<div class=\\"dish\\"><div><div class=\\"name\\">{{DISH_NAME}}</div><div class=\\"desc\\">{{DISH_DESC}}</div>{{ALLERGENS_HTML}}</div><div class=\\"price\\">{{PRICE}}</div></div>",
  "footerHtml": "</div>"
}
(En el ejemplo el <div class="menu"> abre en headerHtml y cierra en footerHtml; también podés usar frameHtml con {{CONTENT}} para envolver.)`;

const HARD_RULES = `Reglas duras:
- SIN recursos externos (nada de http/https, @import, url() que no sea data:), SIN <script>, SIN <style> dentro de los fragmentos, SIN JS.
- El CSS es libre: definí las clases que quieras y usalas en los fragmentos.
- Debe tolerar un número VARIABLE de secciones y platos, y varias páginas A4 (usá @page para el tamaño/márgenes o padding en el contenedor; evitá alturas fijas que corten texto).
- Los iconos de alérgenos llegan dentro de {{ALLERGENS_HTML}} como <span class="allergen-icons"> con varios <span class="allergen-icon"> (SVG inline). Podés estilar .allergen-icons / .allergen-icon. La LEYENDA de alérgenos al pie la agrega el server (clase .allergen-legend, con .allergen-legend-title / .allergen-legend-list / .allergen-legend-item / .allergen-legend-label) — podés estilarla en tu CSS, no la generes vos.
- Priorizá FIDELIDAD al diseño de la carta real: tipografías parecidas, colores del papel/tinta/acento, ornamentos (filetes, marcos, versalitas), alineaciones y densidad.`;

const PDF_MULTIPAGE_NOTE = `El documento puede tener varias páginas: basate en la página más representativa del diseño interior (donde se listan los platos), ignorando portada/contraportada si difieren.`;

function buildGeneratePrompt(isPdf: boolean, feedback?: string): string {
  return [
    "Replicá el diseño de esta carta de restaurante como un theme HTML/CSS imprimible en A4.",
    ...(isPdf ? [PDF_MULTIPAGE_NOTE] : []),
    `Catálogo de fuentes disponibles (usá los ids en fontTitle/fontBody/fontAccent y los nombres de familia en el CSS):\n${FONT_CATALOG}`,
    CONTRACT,
    HARD_RULES,
    ...(feedback
      ? [`Tu intento anterior fue RECHAZADO: ${feedback}\nUsá EXACTAMENTE los placeholders del contrato (MAYÚSCULAS con guiones bajos).`]
      : []),
  ].join("\n\n");
}

const REFINE_PROMPT = `Te paso DOS imágenes: primero la carta ORIGINAL del restaurante, y segundo el RENDER de tu theme (con otros platos de muestra). Comparalas y emití el theme CORREGIDO completo, acercándolo al original en: tipografías (familia y tamaños), colores (papel, tinta, acento), espaciados y márgenes, ornamentos (filetes, marcos, versalitas), alineaciones y densidad. Respetá el mismo contrato de fragmentos y placeholders. Si ya está muy fiel, devolvé el theme igual.`;

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
          price: 1400,
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
          name: "Branzino in crosta",
          description: "Branzino intero in crosta di sale, verdure di stagione",
          price: 2400,
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
  showAllergensInPdf: true,
  allergenLegendTitle: "ALLERGENI",
  allergenLabels: IT_ALLERGEN_LABELS,
};

function fileBlock(buffer: Uint8Array, mimeType: string): Anthropic.ContentBlockParam {
  const base64 = Buffer.from(buffer).toString("base64");
  return mimeType === "application/pdf"
    ? {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: base64 },
      }
    : {
        type: "image",
        source: {
          type: "base64",
          media_type: mimeType as "image/jpeg" | "image/png" | "image/webp",
          data: base64,
        },
      };
}

// Extrae el bloque tool_use, valida con Zod y SANITIZA. Lanza si el modelo no
// devolvió el bloque, si no valida, o si el sanitizado detecta un breakout.
function parseThemeFromResponse(msg: Anthropic.Message): MenuCustomTheme {
  const block = msg.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use")
    throw new Error("El modelo no devolvió el bloque estructurado del theme");
  const parsed = MenuCustomThemeSchema.safeParse(block.input);
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
  client: Anthropic,
  block: Anthropic.ContentBlockParam,
  isPdf: boolean,
  feedback?: string,
): Promise<MenuCustomTheme> {
  const msg = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 8192,
    tools: [EMIT_THEME_TOOL as unknown as Anthropic.Tool],
    tool_choice: { type: "tool", name: "emit_menu_theme" },
    messages: [
      {
        role: "user",
        content: [block, { type: "text", text: buildGeneratePrompt(isPdf, feedback) }],
      },
    ],
  });
  const theme = parseThemeFromResponse(msg);
  validateThemeStructure(theme);
  return theme;
}

export async function generateMenuTheme(
  buffer: Uint8Array,
  mimeType: string,
): Promise<{ theme: MenuCustomTheme; refined: boolean }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY no configurada en el servidor");

  const isPdf = mimeType === "application/pdf";
  const block = fileBlock(buffer, mimeType);
  const client = new Anthropic({ apiKey });

  // ── Llamada 1: generar (con retry si falla la validación ESTRUCTURAL) ──
  let themeV1: MenuCustomTheme;
  try {
    themeV1 = await generateAndValidate(client, block, isPdf);
  } catch (err) {
    if (err instanceof ThemeValidationError) {
      // El modelo ignoró el contrato de placeholders (p.ej. frameHtml sin
      // {{CONTENT}}, o nombres camelCase/inventados). Reintentamos UNA vez con el
      // motivo exacto del rechazo como feedback. Si vuelve a fallar, propaga
      // (el endpoint lo trata como best-effort: guarda el theme en null).
      themeV1 = await generateAndValidate(client, block, isPdf, err.message);
    } else {
      throw err; // red / Zod / sanitizado → sin retry
    }
  }

  // ── Refinamiento best-effort: render de muestra → screenshot → corrección ──
  try {
    const sampleHtml = renderGeneratedTheme(SAMPLE_INPUT, themeV1);
    const png = await renderHtmlToPng(sampleHtml);
    const refine = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 8192,
      tools: [EMIT_THEME_TOOL as unknown as Anthropic.Tool],
      tool_choice: { type: "tool", name: "emit_menu_theme" },
      messages: [
        {
          role: "user",
          content: [
            block,
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: png.toString("base64"),
              },
            },
            { type: "text", text: REFINE_PROMPT },
          ],
        },
      ],
    });
    const themeV2 = parseThemeFromResponse(refine);
    // Validación estructural DENTRO del try: un refinado que rompe el contrato
    // de placeholders cae a v1 en vez de romper el render.
    validateThemeStructure(themeV2);
    return { theme: themeV2, refined: true };
  } catch (err) {
    // El refine NUNCA tira: si falla, nos quedamos con el theme v1.
    logger.warn("menu_style_theme_refine_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { theme: themeV1, refined: false };
  }
}
