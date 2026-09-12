import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
vi.mock("./ai/budget", () => ({ reserveGeneration: vi.fn().mockResolvedValue({ id: "reservation" }), settleGeneration: vi.fn().mockResolvedValue(undefined) }));
import { readFileSync } from "node:fs";
import { join } from "node:path";

const create = vi.fn();
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });


import {
  extractRecipeFromText,
  extractRecipeFromImage,
  fileMatchesMime,
} from "./recipe-extraction";

// Fixture REAL del Arroz Meloso (cmpcy5d4l), turno truncado por effort:low.
const arroz = readFileSync(
  join(
    __dirname,
    "..",
    "..",
    "mobile",
    "src",
    "lib",
    "__fixtures__",
    "a01-arroz-truncated.txt",
  ),
  "utf8",
);

function jsonReply(input: unknown, usage = {}, finish_reason = "stop") {
  return { choices: [{ finish_reason, message: { content: JSON.stringify(input) } }], usage };
}

beforeEach(() => {
  create.mockReset();
  vi.stubEnv("ZAI_API_KEY", "glm-test-key");
  vi.stubGlobal("fetch", vi.fn(async (_url, init) => Response.json(await create(JSON.parse(init.body)))));
});

describe("extractRecipeFromText — A-01 (extracción desacoplada)", () => {
  it("conserva la ficha completa aunque GLM añada un bloque JSON y comas finales", async () => {
    const expected = { title: "Ricciola al ponzu", portions: 4, ingredients: ["600 g ricciola", "40 ml ponzu, frío"],
      method: ['Cortar sin marcar. El texto ",}" se conserva.', "Aliñar al pase."], notes: "Mantener las cantidades." };
    const formatted = JSON.stringify(expected).replace(/}$/, ",}");
    create.mockResolvedValue({ choices: [{ finish_reason: "stop", message: { content: `\x60\x60\x60json\n${formatted}\n\x60\x60\x60` } }] });
    expect(await extractRecipeFromText("Receta para cuatro personas")).toEqual(expected);
    expect(create).toHaveBeenCalledTimes(1);
  });
  it("normalizar el formato no permite guardar una ficha sin ingredientes ni método", async () => {
    create.mockResolvedValue({ choices: [{ finish_reason: "stop", message: { content: '\x60\x60\x60json\n{"title":"Incompleta",}\n\x60\x60\x60' } }] });
    await expect(extractRecipeFromText("Receta incompleta")).rejects.toThrow("Receta estructurada inválida");
    expect(create).toHaveBeenCalledTimes(1);
  });
  it("preserves explicit portions and leaves unspecified portions unknown", async () => {
    const recipe = { title: "Arroz", ingredients: ["400 g arroz"], method: ["Cocer"], notes: "" };
    create.mockResolvedValue(jsonReply({ ...recipe, portions: 4 }));
    expect(await extractRecipeFromText("Arroz para cuatro personas")).toHaveProperty("portions", 4);
    create.mockResolvedValue(jsonReply(recipe));
    expect(await extractRecipeFromText("Arroz")).toHaveProperty("portions", null);
  });
  it("devuelve receta validada desde el JSON estructurado", async () => {
    create.mockResolvedValue(
      jsonReply({
        title: "Arroz Meloso de Mariscos y Ñoras",
        ingredients: ["Arroz Carnaroli 320 g", "Gambas rojas 8 u"],
        method: ["Hacer el sofrito", "Nacarar el arroz"],
        notes: "",
      }),
    );
    const r = await extractRecipeFromText(arroz);
    expect(r.title).toBe("Arroz Meloso de Mariscos y Ñoras");
    expect(r.ingredients.length).toBe(2);
    expect(r.method.length).toBe(2);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "glm-5.3-flash",
        response_format: { type: "json_object" },
      }),
    );
  });

  it("regresión: el título es el plato real, NO el mensaje del usuario", async () => {
    create.mockResolvedValue(
      jsonReply({
        title: "Arroz Meloso de Mariscos y Ñoras",
        ingredients: ["Ñoras 2 u"],
        method: ["Hidratar las ñoras"],
        notes: "",
      }),
    );
    const r = await extractRecipeFromText(arroz);
    expect(r.title).not.toMatch(/desarroll|^ok\b|receta completa/i);
    expect(r.title).toContain("Arroz Meloso");
  });

  it("sin JSON en la respuesta → error", async () => {
    create.mockResolvedValue({ content: [{ type: "text", text: "nope" }] });
    await expect(extractRecipeFromText(arroz)).rejects.toThrow();
  });

  it("JSON con shape inválida → error (Zod lo rechaza)", async () => {
    create.mockResolvedValue(
      jsonReply({ title: "", ingredients: "no-es-array" }),
    );
    await expect(extractRecipeFromText(arroz)).rejects.toThrow();
  });

  it("texto vacío → error, sin llamar al modelo", async () => {
    await expect(extractRecipeFromText("   ")).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
  });

  it("sin ZAI_API_KEY en el server → error claro", async () => {
    vi.stubEnv("ZAI_API_KEY", "");
    await expect(extractRecipeFromText(arroz)).rejects.toThrow(
      /ai_provider_unconfigured/,
    );
  });
});

describe("fileMatchesMime — magic bytes de imagen", () => {
  it("acepta JPEG con SOI FF D8 FF", () => {
    const buf = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(fileMatchesMime(buf, "image/jpeg")).toBe(true);
  });

  it("acepta PNG con su firma de 8 bytes", () => {
    const buf = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
    ]);
    expect(fileMatchesMime(buf, "image/png")).toBe(true);
  });

  it("acepta WEBP con RIFF....WEBP", () => {
    const buf = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    ]);
    expect(fileMatchesMime(buf, "image/webp")).toBe(true);
  });

  it("rechaza buffer basura para cada tipo de imagen", () => {
    const junk = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b]);
    expect(fileMatchesMime(junk, "image/jpeg")).toBe(false);
    expect(fileMatchesMime(junk, "image/png")).toBe(false);
    expect(fileMatchesMime(junk, "image/webp")).toBe(false);
  });

  it("rechaza buffer demasiado corto", () => {
    expect(fileMatchesMime(new Uint8Array([0xff]), "image/jpeg")).toBe(false);
    expect(fileMatchesMime(new Uint8Array([0x89, 0x50]), "image/png")).toBe(false);
    expect(fileMatchesMime(new Uint8Array([0x52, 0x49, 0x46, 0x46]), "image/webp")).toBe(false);
  });
});

describe("extractRecipeFromImage — visión (server-only)", () => {
  it("devuelve receta validada desde el JSON estructurado", async () => {
    create.mockResolvedValue(
      jsonReply({
        title: "Tarta de manzana",
        ingredients: ["Manzanas 4 u", "Harina 200 g"],
        method: ["Pelar las manzanas", "Hornear 40 min"],
        notes: "Servir tibia",
      }),
    );
    const r = await extractRecipeFromImage(
      new Uint8Array([0xff, 0xd8, 0xff]),
      "image/jpeg",
    );
    expect(r.title).toBe("Tarta de manzana");
    expect(r.ingredients.length).toBe(2);
    expect(r.method.length).toBe(2);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "glm-5.3-flash",
        response_format: { type: "json_object" },
      }),
    );
  });

  it("JSON con shape inválida (falta campo) → error", async () => {
    create.mockResolvedValue(
      jsonReply({ title: "Sin ingredientes", method: ["Paso"], notes: "" }),
    );
    await expect(
      extractRecipeFromImage(new Uint8Array([0xff, 0xd8, 0xff]), "image/jpeg"),
    ).rejects.toThrow();
  });

  it("sin ZAI_API_KEY → error, sin llamar al modelo", async () => {
    vi.stubEnv("ZAI_API_KEY", "");
    await expect(
      extractRecipeFromImage(new Uint8Array([0xff, 0xd8, 0xff]), "image/jpeg"),
    ).rejects.toThrow(/ai_provider_unconfigured/);
    expect(create).not.toHaveBeenCalled();
  });
});
