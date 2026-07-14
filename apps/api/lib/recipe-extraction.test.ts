import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Mock del SDK Anthropic — `create` compartido, hoisted para que vi.mock
// (que se eleva sobre los imports) pueda referenciarlo.
const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create };
  },
}));

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

function toolUse(input: unknown) {
  return { content: [{ type: "tool_use", name: "emit_recipe", input }] };
}

beforeEach(() => {
  create.mockReset();
  process.env.ANTHROPIC_API_KEY = "sk-ant-test";
});

describe("extractRecipeFromText — A-01 (extracción desacoplada)", () => {
  it("devuelve receta validada desde el tool_use forzado", async () => {
    create.mockResolvedValue(
      toolUse({
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
        model: "claude-haiku-4-5",
        tool_choice: { type: "tool", name: "emit_recipe" },
      }),
    );
  });

  it("regresión: el título es el plato real, NO el mensaje del usuario", async () => {
    create.mockResolvedValue(
      toolUse({
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

  it("sin tool_use en la respuesta → error", async () => {
    create.mockResolvedValue({ content: [{ type: "text", text: "nope" }] });
    await expect(extractRecipeFromText(arroz)).rejects.toThrow();
  });

  it("tool_use con shape inválida → error (Zod lo rechaza)", async () => {
    create.mockResolvedValue(
      toolUse({ title: "", ingredients: "no-es-array" }),
    );
    await expect(extractRecipeFromText(arroz)).rejects.toThrow();
  });

  it("texto vacío → error, sin llamar al modelo", async () => {
    await expect(extractRecipeFromText("   ")).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
  });

  it("sin ANTHROPIC_API_KEY en el server → error claro", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(extractRecipeFromText(arroz)).rejects.toThrow(
      /ANTHROPIC_API_KEY/,
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
  it("devuelve receta validada desde el tool_use forzado", async () => {
    create.mockResolvedValue(
      toolUse({
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
        model: "claude-haiku-4-5",
        tool_choice: { type: "tool", name: "emit_recipe" },
      }),
    );
  });

  it("tool_use con shape inválida (falta campo) → error", async () => {
    create.mockResolvedValue(
      toolUse({ title: "Sin ingredientes", method: ["Paso"], notes: "" }),
    );
    await expect(
      extractRecipeFromImage(new Uint8Array([0xff, 0xd8, 0xff]), "image/jpeg"),
    ).rejects.toThrow();
  });

  it("sin ANTHROPIC_API_KEY → error, sin llamar al modelo", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(
      extractRecipeFromImage(new Uint8Array([0xff, 0xd8, 0xff]), "image/jpeg"),
    ).rejects.toThrow(/ANTHROPIC_API_KEY/);
    expect(create).not.toHaveBeenCalled();
  });
});
