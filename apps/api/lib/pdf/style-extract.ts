import { generateGlmJson } from "../ai/glm";
import { visionParts } from "../ai/media";
import type { AiPart } from "../ai/types";
import { MenuStyleSpecSchema, type MenuStyleSpec } from "@atelier/shared";

// El esquema se envía como JSON Schema; Zod valida la respuesta antes de guardarla.
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
  options?: { sourceParts?: AiPart[]; onUsage?: (input: number, output: number) => Promise<void> | void },
): Promise<MenuStyleSpec> {
  const raw = await generateGlmJson({ task: "menuStyle", system: buildPrompt(mimeType === "application/pdf"),
    schema: EMIT_STYLE_TOOL.input_schema, content: options?.sourceParts ?? await visionParts(buffer, mimeType),
    incompleteCode: "Análisis del estilo incompleto",
    onUsage: async usage => { try { await options?.onUsage?.(usage.inputTokens, usage.outputTokens); } catch { /* Telemetry must not discard a valid result. */ } },
  });
  const parsed = MenuStyleSpecSchema.safeParse(raw);
  if (!parsed.success)
    throw new Error(
      `Estilo extraído inválido: ${parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join(", ")}`,
    );
  return parsed.data;
}
