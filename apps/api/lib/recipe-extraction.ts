// Extracts a structured recipe (title + ingredients/method/notes) from a PDF
// or DOCX upload. Steps:
//  1. Parse the file to plain text (unpdf for PDF, mammoth for DOCX).
//  2. Ask an LLM to coerce that text into our RecipeContent shape.
//  3. Validate the LLM response with Zod so the caller can trust it.
// Structured extraction uses the server GLM provider; costs and saves remain local rules.
//
// TODO v2: add Google Drive OAuth flow so the user can pick files directly
// from Drive without going through the device file picker.

import { EXTRACTION_INGREDIENT_JSON_SCHEMA, renderRules } from "@atelier/shared";
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

const MAX_EXTRACTED_INGREDIENTS = 50;

// Lenient on purpose: the model may answer with plain lines or with objects
// whose fields are loosely typed ("1/2", "cl"). The extraction pipeline turns
// either into the standard format.
const LooseNumber = z.union([z.number(), z.string().max(50)]).nullable().optional();
const ExtractedIngredientSchema = z.union([
  z.string().max(500),
  z.object({
    section: z.string().max(200).nullable().optional(),
    qty: LooseNumber,
    unit: z.string().max(50).nullable().optional(),
    name: z.string().max(500).nullable().optional(),
    note: z.string().max(1000).nullable().optional(),
    pieceWeightG: LooseNumber,
  }),
]);

const ExtractedRecipeSchema = z.object({
  portions: z.number().int().positive().max(1000).nullable().optional().default(null),
  title: z.string().min(1).max(200),
  ingredients: z.array(ExtractedIngredientSchema).max(MAX_EXTRACTED_INGREDIENTS),
  method: z.array(z.string().min(1).max(500)).max(50),
  notes: z.string().max(5000).optional().default(""),
});

export type ExtractedRecipe = z.infer<typeof ExtractedRecipeSchema>;
export type ExtractionSource = "document" | "chat" | "photo";

/** Typed extraction failure; the code travels as the message, like recipe_context_too_long. */
export class RecipeExtractionError extends Error {
  constructor(public readonly code: "recipe_too_many_ingredients") {
    super(code);
    this.name = "RecipeExtractionError";
  }
}

const EXTRACTION_ROLE = [
  "Eres un extractor de recetas. Convierte la receta al objeto JSON solicitado.",
  "- `title`: el nombre real del plato tal como aparece (suele ser un encabezado, normalmente en negrita); NUNCA una pregunta, instrucción o mensaje del usuario. Si no hay título visible, inventa uno descriptivo con los ingredientes principales.",
  "- `portions`: raciones o personas indicadas explícitamente (entero de 1 a 1000); null si no constan. No las inventes ni confundas piezas con raciones.",
  "- `ingredients` y `method`: en el orden del original, un elemento por ingrediente y por paso.",
  "- Si el texto está incompleto o truncado, extrae lo que haya. No inventes cantidades ausentes ni expliques nada fuera del JSON.",
].join("\n");

const SOURCE_LINES: Record<ExtractionSource, string> = {
  chat:
    "Recibes una conversación CHEF/ASISTENTE: reconstruye la última receta completa e incorpora los cambios posteriores solicitados y acordados, " +
    "conservando ingredientes, cantidades, raciones y pasos no modificados. No mezcles platos diferentes.",
  document: "Recibes el texto de un documento. No mezcles platos diferentes; si hay varios, extrae el primero completo.",
  photo: "Recibes la foto de una receta. Si no contiene una receta legible, devuelve el título «Sin receta» y listas vacías.",
};

/** System prompt of every recipe extraction: the role, the shared ingredient rules and one line per source. */
export function extractionSystem(source: ExtractionSource): string {
  return [EXTRACTION_ROLE, renderRules("extraction"), SOURCE_LINES[source]].join("\n\n");
}

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

  const raw = await generateGlmJson({ task: "extraction", system: extractionSystem("document"), content: truncated, schema: EMIT_RECIPE_TOOL.input_schema, onUsage, incompleteCode: "recipe_extraction_incomplete" });
  return validateRecipe(raw, "No se pudo interpretar la receta del archivo");
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
        items: EXTRACTION_INGREDIENT_JSON_SCHEMA,
        description: "Cada ingrediente como objeto en el formato estándar, en el orden del original.",
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

/** Assistant text ("CHEF: …\nASISTENTE: …") by default; `document` reads plain recipe text. */
export async function extractRecipeFromText(
  recipeText: string,
  onUsage?: UsageCallback,
  source: Exclude<ExtractionSource, "photo"> = "chat",
): Promise<ExtractedRecipe> {
  const text = recipeText.trim();
  if (!text) throw new Error("Texto de receta vacío");
  if (text.length > 30_000) throw new Error("recipe_context_too_long");
  return validateRecipe(await generateGlmJson({ task: "extraction", system: extractionSystem(source),
    schema: EMIT_RECIPE_TOOL.input_schema, content: text, onUsage, incompleteCode: "recipe_extraction_incomplete" }));
}

export async function extractRecipeFromImage(buffer: Uint8Array, mimeType: string, onUsage?: UsageCallback): Promise<ExtractedRecipe> {
  const parts = await visionParts(buffer, mimeType);
  return validateRecipe(await generateGlmJson({ task: "extraction", system: extractionSystem("photo"),
    schema: EMIT_RECIPE_TOOL.input_schema, content: [...parts, { type: "text", text: "Extrae la receta de esta foto." }],
    onUsage, incompleteCode: "recipe_extraction_incomplete" }));
}

/** Validates a model answer (live or recorded) with the lenient extraction schema. */
export function parseExtractedRecipe(raw: unknown): ExtractedRecipe {
  return validateRecipe(raw);
}

function validateRecipe(raw: unknown, failure = "Receta estructurada inválida"): ExtractedRecipe {
  const parsed = ExtractedRecipeSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  if (parsed.error.issues.some((i) => i.code === "too_big" && i.path.length === 1 && i.path[0] === "ingredients")) {
    throw new RecipeExtractionError("recipe_too_many_ingredients");
  }
  throw new Error(`${failure}: ${parsed.error.issues.map((i) => i.message).join(", ")}`);
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
