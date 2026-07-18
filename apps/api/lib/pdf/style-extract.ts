// "Tu estilo" — extrae los tokens de estilo (MenuStyleSpec) de una FOTO o un
// PDF de la carta real del restaurante. Mismo patrón que extractRecipeFromImage
// (lib/recipe-extraction.ts): SIEMPRE server-only (clave Anthropic del
// server — es infraestructura de la app), tool use FORZADO para
// garantizar JSON parseable, y validación
// Zod antes de devolver. Modelo: Sonnet (mejor ojo de diseño que Haiku; es
// UNA llamada por configuración de la casa, no un flujo de alto volumen).

import Anthropic from "@anthropic-ai/sdk";
import { MenuStyleSpecSchema, type MenuStyleSpec } from "@atelier/shared";

// input_schema replica 1:1 los enums y rangos de MenuStyleSpecSchema — el
// tool use fuerza la forma y el Zod de abajo la garantiza.
const EMIT_STYLE_TOOL = {
  name: "emit_menu_style",
  description:
    "Emití los tokens de estilo que mejor aproximan la carta fotografiada. Es obligatorio llamar a esta herramienta una sola vez.",
  input_schema: {
    type: "object" as const,
    properties: {
      fontCategory: { type: "string", enum: ["serif", "sans"] },
      bgColor: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
      inkColor: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
      accentColor: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
      headingColor: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
      frame: { type: "string", enum: ["none", "single", "double"] },
      titleAlign: { type: "string", enum: ["center", "left"] },
      titleItalic: { type: "boolean" },
      titleSizePt: { type: "integer", minimum: 22, maximum: 34 },
      dividerStyle: {
        type: "string",
        enum: ["accent-rule", "full-hairline", "underline", "none"],
      },
      sectionCase: { type: "string", enum: ["uppercase", "smallcaps"] },
      dishLayout: { type: "string", enum: ["row", "stack", "grid"] },
    },
    required: [
      "fontCategory",
      "bgColor",
      "inkColor",
      "accentColor",
      "headingColor",
      "frame",
      "titleAlign",
      "titleItalic",
      "titleSizePt",
      "dividerStyle",
      "sectionCase",
      "dishLayout",
    ],
  },
} as const;

const PROMPT_INTRO = `Analizá esta carta/menú de restaurante (foto o PDF) y emití los tokens de estilo que mejor la aproximen.`;

// SOLO para PDF: el documento puede traer portada/contraportada con un diseño
// distinto al interior — le decimos al modelo en qué página apoyarse.
const PDF_MULTIPAGE_NOTE = `El documento puede tener varias páginas: basá los tokens en la página más representativa del diseño interior (donde se listan los platos), ignorando portada/contraportada si difieren del resto.`;

const PROMPT_GUIDE = `Guía por token:
- fontCategory: ¿la carta usa letra con serifas (serif) o palo seco (sans)?
- bgColor: color de papel/fondo dominante, hex de 6 dígitos.
- inkColor: color del texto corriente (descripciones de platos).
- accentColor: color de precios/adornos/filetes decorativos.
- headingColor: color del título principal y de los nombres de platos.
- frame: ¿tiene borde/marco la página? none = sin marco, single = línea simple, double = línea doble.
- titleAlign: ¿el título principal está centrado (center) o a la izquierda (left)?
- titleItalic: ¿el título principal está en cursiva?
- titleSizePt: tamaño aparente del título en puntos (22 a 34).
- dividerStyle: separador bajo el título — filete corto de acento (accent-rule), línea fina a todo el ancho (full-hairline), subrayado corto bajo el título (underline) o nada (none).
- sectionCase: ¿los encabezados de sección van en MAYÚSCULAS (uppercase) o en versalitas (smallcaps)?
- dishLayout: ¿nombre y precio en la misma línea (row), en bloque con el precio debajo (stack) o en columnas alineadas (grid)?`;

function buildPrompt(isPdf: boolean): string {
  return [PROMPT_INTRO, ...(isPdf ? [PDF_MULTIPAGE_NOTE] : []), PROMPT_GUIDE].join("\n\n");
}

export async function extractMenuStyle(
  buffer: Uint8Array,
  mimeType: string,
): Promise<MenuStyleSpec> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey)
    throw new Error("ANTHROPIC_API_KEY no configurada en el servidor");

  const isPdf = mimeType === "application/pdf";
  const base64 = Buffer.from(buffer).toString("base64");

  // PDF → bloque `document` (visión de páginas renderizadas, soportado nativo
  // por el SDK); cualquier otro mime → bloque `image` como antes.
  const fileBlock: Anthropic.ContentBlockParam = isPdf
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

  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    tools: [EMIT_STYLE_TOOL as unknown as Anthropic.Tool],
    tool_choice: { type: "tool", name: "emit_menu_style" },
    messages: [
      {
        role: "user",
        content: [fileBlock, { type: "text", text: buildPrompt(isPdf) }],
      },
    ],
  });

  const block = msg.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use")
    throw new Error("El modelo no devolvió el bloque estructurado");

  const parsed = MenuStyleSpecSchema.safeParse(block.input);
  if (!parsed.success)
    throw new Error(
      `Estilo extraído inválido: ${parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join(", ")}`,
    );
  return parsed.data;
}
