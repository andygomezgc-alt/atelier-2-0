// apps/mobile/src/lib/__tests__/markdown.test.ts
import { describe, it, expect } from "vitest";
import { parseAssistantMarkdown, parseInline, type Block } from "@/src/lib/markdown";

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

  it("viñetas con * al inicio de linea son lista, no cursiva", () => {
    expect(parseAssistantMarkdown("* shio-koji\n* aceite")).toEqual([
      {
        type: "list",
        ordered: false,
        items: [[{ text: "shio-koji" }], [{ text: "aceite" }]],
      },
    ]);
  });

  it("listas mixtas UL→OL producen dos blocks separados", () => {
    expect(parseAssistantMarkdown("- uno\n1. dos")).toEqual([
      { type: "list", ordered: false, items: [[{ text: "uno" }]] },
      { type: "list", ordered: true, items: [[{ text: "dos" }]] },
    ]);
  });

  it("markdown inline dentro de items de lista", () => {
    expect(parseAssistantMarkdown("- **frio** siempre")).toEqual([
      {
        type: "list",
        ordered: false,
        items: [[{ text: "frio", bold: true }, { text: " siempre" }]],
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

describe("ordered list numbering", () => {
  // Visible number of every ordered item, in order. A list keeps its first
  // number in `start`, omitted when it is 1 (same convention as HTML <ol start>).
  function visibleNumbers(blocks: Block[]): number[] {
    return blocks.flatMap((b) => {
      if (b.type !== "list" || !b.ordered) return [];
      const start = "start" in b && typeof b.start === "number" ? b.start : 1;
      return b.items.map((_, i) => start + i);
    });
  }

  it("restarts numbering after an unindented bullet list, like CommonMark", () => {
    const blocks = parseAssistantMarkdown("1. A\n2. B\n- Nota\n1. C");
    expect(visibleNumbers(blocks)).toEqual([1, 2, 1]);
  });

  it("restarts lazy numbering after a heading, like CommonMark", () => {
    const blocks = parseAssistantMarkdown("## Masa\n1. Harina\n1. Agua\n## Relleno\n1. Ricota");
    expect(visibleNumbers(blocks)).toEqual([1, 2, 1]);
  });

  it("keeps 1, 2, 3 when items are separated by blank lines", () => {
    const blocks = parseAssistantMarkdown("1. Prepara la masa.\n\n2. Hornea 20 minutos.\n\n3. Deja enfriar.");
    expect(visibleNumbers(blocks)).toEqual([1, 2, 3]);
  });

  it("keeps 3 after a nested bullet between items", () => {
    const blocks = parseAssistantMarkdown(
      "1. Prepara la masa.\n\n2. Hornea 20 minutos.\n   - Gira la bandeja a mitad.\n3. Deja enfriar.",
    );
    expect(visibleNumbers(blocks)).toEqual([1, 2, 3]);
    expect(JSON.stringify(blocks)).toContain("Gira la bandeja a mitad.");
  });

  it("keeps numbers across a blank line and an indented continuation paragraph", () => {
    const blocks = parseAssistantMarkdown("1. Prepara la masa.\n\n   Amasa cinco minutos.\n\n2. Hornea 20 minutos.");
    expect(visibleNumbers(blocks)).toEqual([1, 2]);
  });

  it("starts a list at the number the model wrote", () => {
    const blocks = parseAssistantMarkdown("Antes de empezar revisa el horno.\n4. Bate los huevos.\n5. Monta la nata.");
    expect(visibleNumbers(blocks)).toEqual([4, 5]);
  });

  it("guard: an unindented paragraph after an ordered list ends the list", () => {
    const blocks = parseAssistantMarkdown("1. Prepara la masa.\n\nNota final del chef.");
    expect(blocks.map((b) => b.type)).toEqual(["list", "paragraph"]);
  });

  it("numbers lazy 1. 1. 1. items as 1, 2, 3", () => {
    const blocks = parseAssistantMarkdown("1. Prepara la masa.\n1. Hornea 20 minutos.\n1. Deja enfriar.");
    expect(visibleNumbers(blocks)).toEqual([1, 2, 3]);
  });

  it("numbers lazy 1. 1. 1. items separated by blank lines as 1, 2, 3", () => {
    const blocks = parseAssistantMarkdown("1. Prepara la masa.\n\n1. Hornea 20 minutos.\n\n1. Deja enfriar.");
    expect(visibleNumbers(blocks)).toEqual([1, 2, 3]);
  });

  it("numbers an open list with a gap as start + index", () => {
    const blocks = parseAssistantMarkdown("1. Prepara la masa.\n3. Hornea 20 minutos.");
    expect(visibleNumbers(blocks)).toEqual([1, 2]);
  });
});
