// apps/mobile/src/lib/__tests__/markdown.test.ts
import { describe, it, expect } from "vitest";
import { parseAssistantMarkdown, parseInline } from "@/src/lib/markdown";

describe("parseInline", () => {
  it("texto plano produce un span simple", () => {
    expect(parseInline("hola chef")).toEqual([{ text: "hola chef" }]);
  });

  it("negrita con **", () => {
    expect(parseInline("usa **shio-koji** ligero")).toEqual([
      { text: "usa " },
      { text: "shio-koji", bold: true },
      { text: " ligero" },
    ]);
  });

  it("cursiva con *", () => {
    expect(parseInline("un toque *amaro*")).toEqual([
      { text: "un toque " },
      { text: "amaro", italic: true },
    ]);
  });

  it("negrita sin cerrar queda literal (tolerancia a streaming)", () => {
    expect(parseInline("marinar **12 min")).toEqual([{ text: "marinar **12 min" }]);
  });

  it("string vacio produce []", () => {
    expect(parseInline("")).toEqual([]);
  });
});

describe("parseAssistantMarkdown", () => {
  it("parrafo simple", () => {
    expect(parseAssistantMarkdown("Crudo de gambero a 4°C.")).toEqual([
      { type: "paragraph", spans: [{ text: "Crudo de gambero a 4°C." }] },
    ]);
  });

  it("heading con ## y cuerpo", () => {
    const blocks = parseAssistantMarkdown("## Emplatado\nBase de agrumi.");
    expect(blocks).toEqual([
      { type: "heading", text: "Emplatado" },
      { type: "paragraph", spans: [{ text: "Base de agrumi." }] },
    ]);
  });

  it("lista no ordenada agrupa items consecutivos", () => {
    const blocks = parseAssistantMarkdown("- shio-koji\n- aceite de mandarina");
    expect(blocks).toEqual([
      {
        type: "list",
        ordered: false,
        items: [[{ text: "shio-koji" }], [{ text: "aceite de mandarina" }]],
      },
    ]);
  });

  it("lista ordenada con 1. 2.", () => {
    const blocks = parseAssistantMarkdown("1. marinar\n2. secar");
    expect(blocks).toEqual([
      { type: "list", ordered: true, items: [[{ text: "marinar" }], [{ text: "secar" }]] },
    ]);
  });

  it("heuristica de titulo: primera linea corta sin . ni : final", () => {
    const blocks = parseAssistantMarkdown("Gambero rosso e agrumi\nCrudo a 4°C.");
    expect(blocks[0]).toEqual({ type: "title", text: "Gambero rosso e agrumi" });
  });

  it("heuristica NO aplica si la primera linea termina en :", () => {
    const blocks = parseAssistantMarkdown("Ingredientes:\n- gambero");
    expect(blocks[0].type).not.toBe("title");
  });

  it("heuristica NO aplica con una sola linea", () => {
    expect(parseAssistantMarkdown("Hola chef")).toEqual([
      { type: "paragraph", spans: [{ text: "Hola chef" }] },
    ]);
  });

  it("heuristica NO aplica si hay headings markdown", () => {
    const blocks = parseAssistantMarkdown("Plato nuevo\n## Pasos\n- uno");
    expect(blocks[0].type).not.toBe("title");
  });

  it("vacio y solo espacios producen []", () => {
    expect(parseAssistantMarkdown("")).toEqual([]);
    expect(parseAssistantMarkdown("  \n  ")).toEqual([]);
  });

  it("streaming: ningun prefijo de un texto real lanza error", () => {
    const full =
      "Gambero rosso e agrumi\n## Pasos\n1. Marinar **12 min** en shio-koji\n2. Secar\n\n- nota: *frio* siempre\n- 4°C max";
    for (let i = 0; i <= full.length; i++) {
      expect(() => parseAssistantMarkdown(full.slice(0, i))).not.toThrow();
    }
  });
});
