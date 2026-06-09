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

import { extractRecipeFromText } from "./recipe-extraction";

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
