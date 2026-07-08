// Extracts a structured recipe (title + ingredients/method/notes) from a PDF
// or DOCX upload. Steps:
//  1. Parse the file to plain text (unpdf for PDF, mammoth for DOCX).
//  2. Ask an LLM to coerce that text into our RecipeContent shape.
//  3. Validate the LLM response with Zod so the caller can trust it.
//
// BYOK-aware: if the user has a custom provider configured, we route through
// it. Otherwise we use the server's Anthropic key + Haiku 4.5 (fast/cheap; the
// task is structured extraction, not deep reasoning).
//
// TODO v2: add Google Drive OAuth flow so the user can pick files directly
// from Drive without going through the device file picker.

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";
import { z } from "zod";

export const PDF_MIME = "application/pdf";
export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

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
  return false;
}

export type ExtractorBYOK = {
  provider: "anthropic" | "openai" | "google";
  apiKey: string;
  model: string;
} | null;

const ExtractedRecipeSchema = z.object({
  title: z.string().min(1).max(200),
  ingredients: z.array(z.string().min(1).max(500)).max(50),
  method: z.array(z.string().min(1).max(500)).max(50),
  notes: z.string().max(5000).optional().default(""),
});

export type ExtractedRecipe = z.infer<typeof ExtractedRecipeSchema>;

const PROMPT = `Extraé esta receta del texto siguiente. Devolvé SOLO un objeto JSON con esta forma exacta:
{
  "title": "Nombre claro de la receta",
  "ingredients": ["Ingrediente 1 con cantidad", "Ingrediente 2 con cantidad"],
  "method": ["Paso 1...", "Paso 2..."],
  "notes": "Notas, tips o técnica opcional. Si no hay, devolvé string vacía."
}

Reglas:
- Si la receta no tiene título visible, inventá uno descriptivo basado en los ingredientes principales.
- Cada ingrediente como string separado en \`ingredients\`, en el orden del original.
- Cada paso del método como string separado en \`method\`, en orden.
- No incluyas markdown, no expliques, no agregues texto fuera del JSON.

TEXTO:
`;

export async function extractRecipeFromFile(
  buffer: Uint8Array,
  mimeType: string,
  byok: ExtractorBYOK,
): Promise<ExtractedRecipe> {
  const text = await fileToText(buffer, mimeType);
  if (!text.trim()) throw new Error("El archivo no contiene texto legible");

  // Safety cap: keep prompts predictable in size. ~30k chars ≈ 8k tokens.
  const truncated = text.length > 30_000 ? text.slice(0, 30_000) : text;

  const raw = await callForExtraction(PROMPT, truncated, byok);
  const parsed = ExtractedRecipeSchema.safeParse(parseJsonLoose(raw));
  if (!parsed.success) {
    throw new Error(
      `No se pudo interpretar la receta del archivo: ${parsed.error.issues
        .map((i) => i.message)
        .join(", ")}`,
    );
  }
  return parsed.data;
}

// --- Extracción desde TEXTO (Asistente → "Guardar como receta", A-01). ---
// A diferencia de extractRecipeFromFile (BYOK-aware), esta SIEMPRE usa la
// clave del server + Haiku con TOOL USE FORZADO. Decisión A-01 "Opción A":
// la extracción es infraestructura de la app, no el servicio personal del
// chef; y el tool use forzado da garantía técnica de JSON parseable (no
// "esperanza" de que el modelo cumpla un formato de texto). Validado en
// datos reales (Arroz Meloso truncado + Ricciola): Haiku 10/10.
const EMIT_RECIPE_TOOL = {
  name: "emit_recipe",
  description:
    "Emití la receta del texto en forma estructurada. Es obligatorio llamar a esta herramienta una sola vez.",
  input_schema: {
    type: "object" as const,
    properties: {
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
    required: ["title", "ingredients", "method", "notes"],
  },
} as const;

const EXTRACT_TEXT_SYSTEM =
  "Sos un extractor de recetas. Convertí el texto de receta a la herramienta emit_recipe. " +
  "`title` = el nombre real del plato tal como aparece en el texto (un encabezado, normalmente en negrita), " +
  "NUNCA una pregunta, instrucción o mensaje del usuario. Si el texto está incompleto o truncado, " +
  "extraé lo que haya. No expliques nada fuera de la herramienta.";

export async function extractRecipeFromText(
  recipeText: string,
): Promise<ExtractedRecipe> {
  const text = recipeText.trim();
  if (!text) throw new Error("Texto de receta vacío");
  const truncated = text.length > 30_000 ? text.slice(0, 30_000) : text;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey)
    throw new Error("ANTHROPIC_API_KEY no configurada en el servidor");

  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 4096,
    system: EXTRACT_TEXT_SYSTEM,
    tools: [EMIT_RECIPE_TOOL as unknown as Anthropic.Tool],
    tool_choice: { type: "tool", name: "emit_recipe" },
    messages: [{ role: "user", content: truncated }],
  });

  const block = msg.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use")
    throw new Error("El modelo no devolvió el bloque estructurado");

  const parsed = ExtractedRecipeSchema.safeParse(block.input);
  if (!parsed.success)
    throw new Error(
      `Receta estructurada inválida: ${parsed.error.issues
        .map((i) => i.message)
        .join(", ")}`,
    );
  return parsed.data;
}

async function fileToText(buffer: Uint8Array, mimeType: string): Promise<string> {
  if (mimeType === PDF_MIME) {
    const doc = await getDocumentProxy(buffer);
    const out = await extractText(doc, { mergePages: true });
    return Array.isArray(out.text) ? out.text.join("\n") : out.text;
  }
  if (mimeType === DOCX_MIME) {
    const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
    return result.value;
  }
  throw new Error(`Tipo de archivo no soportado: ${mimeType}`);
}

// Strip optional ```json fences before JSON.parse. LLMs add them despite the
// "no markdown" instruction.
function parseJsonLoose(raw: string): unknown {
  let s = raw.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }
  return JSON.parse(s);
}

// `instructions` es el prefix estable (cacheable). `fileText` cambia por
// upload. max_tokens=2048 es holgado: el output es JSON de ~200-400 tokens
// incluso con recetas grandes (50 ingredientes + 50 pasos).
async function callForExtraction(
  instructions: string,
  fileText: string,
  byok: ExtractorBYOK,
): Promise<string> {
  const MAX_OUTPUT_TOKENS = 2048;

  if (byok?.provider === "anthropic") {
    const client = new Anthropic({ apiKey: byok.apiKey });
    const msg = await client.messages.create({
      model: byok.model,
      max_tokens: MAX_OUTPUT_TOKENS,
      messages: [
        {
          role: "user",
          content: [
            // Prefix estable: Anthropic cachea ~5 min y descontamos costo
            // del prefix en uploads sucesivos del mismo chef.
            { type: "text", text: instructions, cache_control: { type: "ephemeral" } },
            { type: "text", text: fileText },
          ],
        },
      ],
    });
    return firstTextBlock(msg);
  }

  if (byok?.provider === "openai") {
    // OpenAI hace prompt caching automático para prompts >1024 tokens, sin
    // API explícita. Concatenamos y dejamos que el server cachee solo.
    const client = new OpenAI({ apiKey: byok.apiKey });
    const completion = await client.chat.completions.create({
      model: byok.model,
      max_tokens: MAX_OUTPUT_TOKENS,
      messages: [{ role: "user", content: instructions + fileText }],
      response_format: { type: "json_object" },
    });
    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error("OpenAI no devolvió contenido");
    return content;
  }

  if (byok?.provider === "google") {
    // Gemini caching es una API aparte (CachedContent). No vale la pena
    // por upload — el ahorro se cobra solo a partir de N hits del mismo cache.
    const client = new GoogleGenAI({ apiKey: byok.apiKey });
    const model = byok.model
      .trim()
      .replace(/^models\//, "")
      .replace(/^google\//, "")
      .replace(/\s+/g, "-")
      .toLowerCase();
    const result = await client.models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: instructions + fileText }] }],
      config: {
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        responseMimeType: "application/json",
      },
    });
    const text = result.text;
    if (!text) throw new Error("Google no devolvió contenido");
    return text;
  }

  // Default path: server's Anthropic key, Haiku 4.5 (cheap + fast).
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY no configurada en el servidor");
  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: MAX_OUTPUT_TOKENS,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: instructions, cache_control: { type: "ephemeral" } },
          { type: "text", text: fileText },
        ],
      },
    ],
  });
  return firstTextBlock(msg);
}

function firstTextBlock(msg: Anthropic.Message): string {
  const block = msg.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("Sin respuesta de texto");
  return block.text;
}
