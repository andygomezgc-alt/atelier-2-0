// Extracts a structured recipe (title + ingredients/method/notes) from a PDF
// or DOCX upload. Steps:
//  1. Parse the file to plain text (unpdf for PDF, mammoth for DOCX).
//  2. Ask an LLM to coerce that text into our RecipeContent shape.
//  3. Validate the LLM response with Zod so the caller can trust it.
// Structured extraction uses the server GLM provider; costs and saves remain local rules.
//
// TODO v2: add Google Drive OAuth flow so the user can pick files directly
// from Drive without going through the device file picker.

import { generateGlmJson } from "./ai/glm";
import { visionParts } from "./ai/media";
import type { UsageCallback } from "./ai/types";
import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";
import { z } from "zod";

export const PDF_MIME = "application/pdf";
export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;

// Valida que el CONTENIDO real coincida con el MIME declarado. El cliente puede
// mentir en el header/extensión; acá miramos los primeros bytes (magic number).
// PDF empieza con "%PDF"; DOCX es un contenedor ZIP ("PK" + 0x03/0x05/0x07).
export function fileMatchesMime(buffer: Uint8Array, mime: string): boolean {
  if (buffer.length < 4) return false;
  if (mime === PDF_MIME) {
    return (
      buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46
    );
  }
  if (mime === DOCX_MIME) {
    return (
      buffer[0] === 0x50 &&
      buffer[1] === 0x4b &&
      (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07)
    );
  }
  // JPEG: SOI marker FF D8 FF.
  if (mime === "image/jpeg") {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  // PNG: 8-byte signature 89 50 4E 47 0D 0A 1A 0A.
  if (mime === "image/png") {
    if (buffer.length < 8) return false;
    return (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    );
  }
  // WEBP: contenedor RIFF — bytes 0-3 "RIFF" y bytes 8-11 "WEBP".
  if (mime === "image/webp") {
    if (buffer.length < 12) return false;
    return (
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50
    );
  }
  return false;
}

const ExtractedRecipeSchema = z.object({
  portions: z.number().int().positive().max(1000).nullable().optional().default(null),
  title: z.string().min(1).max(200),
  ingredients: z.array(z.string().min(1).max(500)).max(50),
  method: z.array(z.string().min(1).max(500)).max(50),
  notes: z.string().max(5000).optional().default(""),
});

export type ExtractedRecipe = z.infer<typeof ExtractedRecipeSchema>;

const PROMPT = `Extraé esta receta del texto siguiente. Devolvé SOLO un objeto JSON con esta forma exacta:
{
  "title": "Nombre claro de la receta",
  "portions": null,
  "ingredients": ["Ingrediente 1 con cantidad", "Ingrediente 2 con cantidad"],
  "method": ["Paso 1...", "Paso 2..."],
  "notes": "Notas, tips o técnica opcional. Si no hay, devolvé string vacía."
}

Reglas:
- Si la receta no tiene título visible, inventá uno descriptivo basado en los ingredientes principales.
- portions: número de raciones/personas explícito (entero de 1 a 1000); null si no se indica. No lo inventes ni confundas piezas con raciones.
- Cada ingrediente como string separado en \`ingredients\`, en el orden del original.
- Cada paso del método como string separado en \`method\`, en orden.
- No incluyas markdown, no expliques, no agregues texto fuera del JSON.

TEXTO:
`;

export async function extractRecipeFromFile(
  buffer: Uint8Array,
  mimeType: string,
  onUsage?: UsageCallback,
): Promise<ExtractedRecipe> {
  const text = await fileToText(buffer, mimeType);
  if (!text.trim()) {
    if (mimeType === PDF_MIME) return extractRecipeFromImage(buffer, mimeType, onUsage);
    throw new Error("El archivo no contiene texto legible");
  }

  // Safety cap: keep prompts predictable in size. ~30k chars ≈ 8k tokens.
  const truncated = text.length > 30_000 ? text.slice(0, 30_000) : text;

  const raw = await generateGlmJson({ task: "extraction", system: PROMPT, content: truncated, schema: EMIT_RECIPE_TOOL.input_schema, onUsage, incompleteCode: "recipe_extraction_incomplete" });
  const parsed = ExtractedRecipeSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `No se pudo interpretar la receta del archivo: ${parsed.error.issues
        .map((i) => i.message)
        .join(", ")}`,
    );
  }
  return parsed.data;
}

// Schema shared by text, image and file extraction; Zod validates every response.
const EMIT_RECIPE_TOOL = {
  name: "emit_recipe",
  description:
    "Emití la receta del texto en forma estructurada. Es obligatorio llamar a esta herramienta una sola vez.",
  input_schema: {
    type: "object" as const,
    properties: {
      portions: {
        type: ["integer", "null"], minimum: 1, maximum: 1000,
        description: "Raciones/personas indicadas explícitamente. Null si no constan; no inferir de cantidades ni confundir piezas con raciones.",
      },
      title: {
        type: "string",
        description:
          "Nombre real del plato tal como aparece en el texto (suele ser un encabezado en negrita). NUNCA una pregunta, instrucción o mensaje del usuario.",
      },
      ingredients: {
        type: "array",
        items: { type: "string" },
        description: "Cada ingrediente con su cantidad como string, en orden.",
      },
      method: {
        type: "array",
        items: { type: "string" },
        description: "Cada paso del método como string, en orden.",
      },
      notes: {
        type: "string",
        description: "Notas/técnica/servicio. String vacía si no hay.",
      },
    },
    required: ["title", "ingredients", "method", "notes", "portions"],
  },
} as const;

const EXTRACT_TEXT_SYSTEM =
  "Sos un extractor de recetas. Convertí el texto de receta al objeto JSON solicitado. " +
  "`title` = el nombre real del plato tal como aparece en el texto (un encabezado, normalmente en negrita), " +
  "NUNCA una pregunta, instrucción o mensaje del usuario. Si el texto está incompleto o truncado, " +
  "extraé lo que haya. Si recibes una conversación CHEF/ASISTENTE, reconstruye la última receta completa " +
  "e incorpora los cambios posteriores solicitados y acordados, conservando ingredientes, cantidades, raciones y pasos no modificados. " +
  "No mezcles platos diferentes ni inventes cantidades ausentes. No expliques nada fuera del JSON.";

export async function extractRecipeFromText(recipeText: string, onUsage?: UsageCallback): Promise<ExtractedRecipe> {
  const text = recipeText.trim();
  if (!text) throw new Error("Texto de receta vacío");
  if (text.length > 30_000) throw new Error("recipe_context_too_long");
  return validateRecipe(await generateGlmJson({ task: "extraction", system: EXTRACT_TEXT_SYSTEM,
    schema: EMIT_RECIPE_TOOL.input_schema, content: text, onUsage, incompleteCode: "recipe_extraction_incomplete" }));
}

export async function extractRecipeFromImage(buffer: Uint8Array, mimeType: string, onUsage?: UsageCallback): Promise<ExtractedRecipe> {
  const parts = await visionParts(buffer, mimeType);
  return validateRecipe(await generateGlmJson({ task: "extraction", system: EXTRACT_TEXT_SYSTEM,
    schema: EMIT_RECIPE_TOOL.input_schema, content: [...parts, { type: "text", text: "Extrae la receta de esta foto. Si no contiene una receta legible, devuelve el título 'Sin receta' y arrays vacíos." }],
    onUsage, incompleteCode: "recipe_extraction_incomplete" }));
}

function validateRecipe(raw: unknown): ExtractedRecipe {
  const parsed = ExtractedRecipeSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`Receta estructurada inválida: ${parsed.error.issues.map(i => i.message).join(", ")}`);
  return parsed.data;
}

async function fileToText(buffer: Uint8Array, mimeType: string): Promise<string> {
  if (mimeType === PDF_MIME) {
    const doc = await getDocumentProxy(new Uint8Array(buffer));
    try {
      const out = await extractText(doc, { mergePages: true });
      return Array.isArray(out.text) ? out.text.join("\n") : out.text;
    } finally { await doc.destroy(); }
  }
  if (mimeType === DOCX_MIME) {
    const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
    return result.value;
  }
  throw new Error(`Tipo de archivo no soportado: ${mimeType}`);
}
