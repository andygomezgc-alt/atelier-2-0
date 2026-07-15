import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock del SDK Anthropic — `create` compartido, hoisted para que vi.mock
// (que se eleva sobre los imports) pueda referenciarlo. Mismo patrón que
// lib/recipe-extraction.test.ts.
const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create };
  },
}));

import { extractMenuStyle } from "./style-extract";

const SPEC = {
  fontCategory: "serif",
  bgColor: "#f4efe4",
  inkColor: "#2b2b2b",
  accentColor: "#8a2432",
  headingColor: "#1d3a2f",
  frame: "single",
  titleAlign: "center",
  titleItalic: true,
  titleSizePt: 28,
  dividerStyle: "accent-rule",
  sectionCase: "uppercase",
  dishLayout: "row",
};

function toolUse(input: unknown) {
  return { content: [{ type: "tool_use", name: "emit_menu_style", input }] };
}

beforeEach(() => {
  create.mockReset();
  process.env.ANTHROPIC_API_KEY = "sk-ant-test";
});

describe("extractMenuStyle — bloque image vs document", () => {
  it("imagen → el mensaje lleva un bloque type:image con el media_type correcto", async () => {
    create.mockResolvedValue(toolUse(SPEC));
    const buffer = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    const spec = await extractMenuStyle(buffer, "image/png");
    expect(spec).toEqual(SPEC);

    const call = create.mock.calls[0]![0];
    const content = call.messages[0].content;
    const fileBlock = content[0];
    expect(fileBlock.type).toBe("image");
    expect(fileBlock.source.media_type).toBe("image/png");
    expect(fileBlock.source.type).toBe("base64");

    const textBlock = content[1];
    expect(textBlock.type).toBe("text");
    // Sin PDF de por medio, no debe aparecer la nota de multi-página.
    expect(textBlock.text).not.toMatch(/varias páginas/i);
  });

  it("PDF → bloque type:document con media_type application/pdf y la nota multi-página en el prompt", async () => {
    create.mockResolvedValue(toolUse(SPEC));
    const buffer = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const spec = await extractMenuStyle(buffer, "application/pdf");
    expect(spec).toEqual(SPEC);

    const call = create.mock.calls[0]![0];
    const content = call.messages[0].content;
    const fileBlock = content[0];
    expect(fileBlock.type).toBe("document");
    expect(fileBlock.source.media_type).toBe("application/pdf");
    expect(fileBlock.source.type).toBe("base64");

    const textBlock = content[1];
    expect(textBlock.type).toBe("text");
    expect(textBlock.text).toMatch(/varias páginas/i);
  });

  it("tool_use con spec inválido → lanza (Zod lo rechaza)", async () => {
    create.mockResolvedValue(toolUse({ ...SPEC, fontCategory: "cursive" }));
    const buffer = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    await expect(extractMenuStyle(buffer, "image/jpeg")).rejects.toThrow();
  });
});
