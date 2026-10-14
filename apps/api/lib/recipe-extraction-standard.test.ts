// Standard ingredient format in the extraction prompts, the GLM schema and the
// lenient validation of what the model returns. The provider is mocked: these
// tests only look at the request each entry point builds and at validation.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EXTRACTION_INGREDIENT_JSON_SCHEMA, renderRules } from "@atelier/shared";

const { glm, pdf } = vi.hoisted(() => ({
  glm: { generateGlmJson: vi.fn() },
  pdf: { text: "" },
}));
vi.mock("./ai/glm", () => glm);
vi.mock("./ai/media", () => ({ visionParts: vi.fn(async () => [{ type: "image_url", image_url: { url: "data:image/png;base64,AA==" } }]) }));
vi.mock("mammoth", () => ({ default: { extractRawText: vi.fn(async () => ({ value: "Receta del documento" })) } }));
vi.mock("unpdf", () => ({
  getDocumentProxy: vi.fn(async () => ({ destroy: vi.fn(async () => undefined) })),
  extractText: vi.fn(async () => ({ text: pdf.text })),
}));

import {
  DOCX_MIME,
  PDF_MIME,
  RecipeExtractionError,
  extractRecipeFromFile,
  extractRecipeFromImage,
  extractRecipeFromText,
  extractionSystem,
  parseExtractedRecipe,
} from "./recipe-extraction";

type GlmRequest = { system: string; schema: { properties: { ingredients: { items: unknown } } }; content: unknown };
const lastRequest = () => glm.generateGlmJson.mock.calls.at(-1)![0] as GlmRequest;
const RECIPE = { title: "Arroz", portions: null, ingredients: ["400 g arroz"], method: ["Cocer"], notes: "" };
const SOURCES = ["document", "chat", "photo"] as const;

beforeEach(() => {
  glm.generateGlmJson.mockReset();
  glm.generateGlmJson.mockResolvedValue(RECIPE);
  pdf.text = "";
});

describe("extractionSystem", () => {
  it.each(SOURCES)("%s: role, the shared extraction rules and no template marker", (source) => {
    const system = extractionSystem(source);
    expect(system).toContain(renderRules("extraction"));
    expect(system).toMatch(/^Eres un extractor de recetas/);
    expect(system).toContain("`title`");
    expect(system).toContain("`portions`");
    expect(system).not.toContain("{{");
    expect(system).not.toContain("}}");
  });

  it("chat: rebuilds the last complete recipe with the agreed changes and never mixes dishes", () => {
    const system = extractionSystem("chat");
    expect(system).toContain("CHEF/ASISTENTE");
    expect(system).toContain("reconstruye la última receta completa");
    expect(system).toContain("cambios posteriores solicitados y acordados");
    expect(system).toContain("No mezcles platos diferentes");
  });

  it("document: rewrites into the standard format and keeps only the first complete dish", () => {
    const system = extractionSystem("document");
    expect(system).toContain("No mezcles platos diferentes; si hay varios, extrae el primero completo");
    expect(system).toContain("no copies el texto tal cual");
    expect(system).not.toContain("CHEF/ASISTENTE");
  });

  it("photo: answers «Sin receta» with empty lists when there is no legible recipe", () => {
    const system = extractionSystem("photo");
    expect(system).toContain("«Sin receta»");
    expect(system).not.toContain("CHEF/ASISTENTE");
  });

  it("each source gets its own line", () => {
    expect(new Set(SOURCES.map(extractionSystem)).size).toBe(3);
  });

  it("uses neutral tuteo, never voseo", () => {
    for (const source of SOURCES) {
      expect(extractionSystem(source)).not.toMatch(/\b(?:Sos|Extraé|Convertí|Devolvé|devolvé|inventá|Emití|extraé)\b/);
    }
  });
});

describe("extraction requests", () => {
  it("ask for one object per ingredient with the shared schema", async () => {
    await extractRecipeFromText("Arroz");
    expect(lastRequest().schema.properties.ingredients.items).toEqual(EXTRACTION_INGREDIENT_JSON_SCHEMA);
  });

  it("assistant text uses the chat prompt by default", async () => {
    await extractRecipeFromText("CHEF: arroz\nASISTENTE: **Arroz**");
    expect(lastRequest().system).toBe(extractionSystem("chat"));
    expect(lastRequest().content).toBe("CHEF: arroz\nASISTENTE: **Arroz**");
  });

  it("text can be read as a document", async () => {
    await extractRecipeFromText("ARROZ\n400 g arroz", undefined, "document");
    expect(lastRequest().system).toBe(extractionSystem("document"));
  });

  it("DOCX and text PDFs use the document prompt", async () => {
    await extractRecipeFromFile(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), DOCX_MIME);
    expect(lastRequest().system).toBe(extractionSystem("document"));
    expect(lastRequest().content).toBe("Receta del documento");

    pdf.text = "Receta del PDF";
    await extractRecipeFromFile(new Uint8Array([0x25, 0x50, 0x44, 0x46]), PDF_MIME);
    expect(lastRequest().system).toBe(extractionSystem("document"));
    expect(lastRequest().content).toBe("Receta del PDF");
  });

  it("photos and PDFs without text use the photo prompt", async () => {
    await extractRecipeFromImage(new Uint8Array([0xff, 0xd8, 0xff]), "image/jpeg");
    expect(lastRequest().system).toBe(extractionSystem("photo"));
    expect(Array.isArray(lastRequest().content)).toBe(true);

    pdf.text = "   ";
    await extractRecipeFromFile(new Uint8Array([0x25, 0x50, 0x44, 0x46]), PDF_MIME);
    expect(lastRequest().system).toBe(extractionSystem("photo"));
  });
});

describe("lenient ingredient validation", () => {
  const base = { title: "Calamar embutido", portions: 16, method: ["Rellena los tubos"], notes: "" };

  it("accepts plain lines", async () => {
    glm.generateGlmJson.mockResolvedValue({ ...base, ingredients: ["40 g AOVE", "**Farsa**"] });
    expect((await extractRecipeFromText("x")).ingredients).toEqual(["40 g AOVE", "**Farsa**"]);
  });

  it("accepts objects with loose types: qty «1/2», unit «cl», piece weight as text", async () => {
    const ingredients = [
      { section: "Farsa", qty: "1/2", unit: "cl", name: "ron", note: null, pieceWeightG: null },
      { section: "Tripa", qty: 4, unit: "unidad", name: "calamar", note: "sin roturas", pieceWeightG: "350 g" },
      { section: null, qty: 2, unit: "cucharadas", name: "aceite", note: null, pieceWeightG: 0 },
    ];
    glm.generateGlmJson.mockResolvedValue({ ...base, ingredients });
    expect((await extractRecipeFromText("x")).ingredients).toEqual(ingredients);
  });

  it("accepts a mix of lines and objects with missing fields", async () => {
    const ingredients = ["Para la salsa:", { name: "vino blanco", qty: 20, unit: "cl" }, { name: "sal" }, "1 limón"];
    glm.generateGlmJson.mockResolvedValue({ ...base, ingredients });
    expect((await extractRecipeFromText("x")).ingredients).toEqual(ingredients);
  });

  it("rejects values that are neither a line nor an ingredient object", async () => {
    glm.generateGlmJson.mockResolvedValue({ ...base, ingredients: [42] });
    await expect(extractRecipeFromText("x")).rejects.toThrow("Receta estructurada inválida");
  });

  it("keeps the 50-ingredient cap", async () => {
    const lines = (n: number) => Array.from({ length: n }, (_, i) => `${i + 1} g sal`);
    glm.generateGlmJson.mockResolvedValue({ ...base, ingredients: lines(50) });
    expect((await extractRecipeFromText("x")).ingredients).toHaveLength(50);
  });

  it("more than 50 ingredients fail with the typed code recipe_too_many_ingredients", async () => {
    glm.generateGlmJson.mockResolvedValue({ ...base, ingredients: Array.from({ length: 51 }, () => ({ name: "sal" })) });
    const error = await extractRecipeFromText("x").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RecipeExtractionError);
    expect(error).toMatchObject({ code: "recipe_too_many_ingredients", message: "recipe_too_many_ingredients" });
  });

  it("the file path uses the same validation and the same typed code", async () => {
    glm.generateGlmJson.mockResolvedValue({ ...base, ingredients: Array.from({ length: 51 }, () => "1 limón") });
    await expect(extractRecipeFromFile(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), DOCX_MIME))
      .rejects.toMatchObject({ code: "recipe_too_many_ingredients" });
  });

  it("parseExtractedRecipe validates a recorded model output without calling the model", () => {
    expect(parseExtractedRecipe({ ...base, ingredients: [{ name: "AOVE", qty: 40, unit: "g" }] }).ingredients)
      .toEqual([{ name: "AOVE", qty: 40, unit: "g" }]);
    expect(glm.generateGlmJson).not.toHaveBeenCalled();
  });
});
