import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock del SDK Anthropic (create compartido, hoisted) — mismo patrón que
// style-extract.test.ts.
const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create };
  },
}));
// renderHtmlToPng lanza Puppeteer: lo mockeamos para no abrir Chromium en test.
const { renderHtmlToPng } = vi.hoisted(() => ({
  renderHtmlToPng: vi.fn(async () => Buffer.from("fake-png")),
}));
vi.mock("./render", () => ({ renderHtmlToPng }));
vi.mock("../logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { generateMenuTheme } from "./theme-generate";

const VALID_THEME = {
  version: 1,
  fontTitle: "playfair-display",
  fontBody: "lato",
  fontAccent: null,
  css: ".menu{color:#111;font-family:'Lato',sans-serif;margin:0;padding:24mm}",
  frameHtml: null,
  headerHtml: "<h1>{{MENU_NAME}}</h1>",
  sectionHeaderHtml: "<div>{{SECTION_NAME}}</div>",
  dishHtml: "<div>{{DISH_NAME}} {{PRICE}}</div>",
  footerHtml: null,
};

// Segundo theme (refinado) con un marcador distinto para distinguirlo del v1.
const REFINED_THEME = {
  ...VALID_THEME,
  css: ".menu{color:#222;font-family:'Lato',sans-serif;margin:0;padding:20mm}",
};

function toolUse(input: unknown) {
  return { content: [{ type: "tool_use", name: "emit_menu_theme", input }] };
}

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);

beforeEach(() => {
  create.mockReset();
  renderHtmlToPng.mockReset().mockResolvedValue(Buffer.from("fake-png"));
  process.env.ANTHROPIC_API_KEY = "sk-ant-test";
});

describe("generateMenuTheme", () => {
  it("happy path: genera + refina → devuelve el theme refinado con refined:true", async () => {
    create
      .mockResolvedValueOnce(toolUse(VALID_THEME))
      .mockResolvedValueOnce(toolUse(REFINED_THEME));

    const { theme, refined } = await generateMenuTheme(JPEG, "image/jpeg");

    expect(refined).toBe(true);
    expect(theme.css).toContain("#222"); // el refinado
    expect(create).toHaveBeenCalledTimes(2);
    expect(renderHtmlToPng).toHaveBeenCalledTimes(1);
    // La 2ª llamada lleva el PNG del render de muestra como bloque image.
    const secondContent = create.mock.calls[1]![0].messages[0].content;
    expect(secondContent.some((b: { type: string }) => b.type === "image")).toBe(true);
  });

  it("refine falla (2ª llamada tira) → theme v1 + refined:false, sin throw", async () => {
    create
      .mockResolvedValueOnce(toolUse(VALID_THEME))
      .mockRejectedValueOnce(new Error("timeout refine"));

    const { theme, refined } = await generateMenuTheme(JPEG, "image/jpeg");

    expect(refined).toBe(false);
    expect(theme.css).toContain("#111"); // el v1
  });

  it("refine devuelve theme inválido → theme v1 + refined:false", async () => {
    create
      .mockResolvedValueOnce(toolUse(VALID_THEME))
      .mockResolvedValueOnce(toolUse({ ...VALID_THEME, fontTitle: "comic-sans" }));

    const { theme, refined } = await generateMenuTheme(JPEG, "image/jpeg");

    expect(refined).toBe(false);
    expect(theme.css).toContain("#111");
  });

  it("render de muestra falla → theme v1 + refined:false (nunca tira por el refine)", async () => {
    create.mockResolvedValueOnce(toolUse(VALID_THEME));
    renderHtmlToPng.mockRejectedValueOnce(new Error("chromium down"));

    const { theme, refined } = await generateMenuTheme(JPEG, "image/jpeg");

    expect(refined).toBe(false);
    expect(theme.css).toContain("#111");
    // Nunca llegó a la 2ª llamada.
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("theme inválido en la llamada 1 → throw (Zod lo rechaza)", async () => {
    create.mockResolvedValueOnce(toolUse({ ...VALID_THEME, css: "corto" }));
    await expect(generateMenuTheme(JPEG, "image/jpeg")).rejects.toThrow();
  });

  it("PDF → bloque document en la 1ª llamada", async () => {
    create
      .mockResolvedValueOnce(toolUse(VALID_THEME))
      .mockResolvedValueOnce(toolUse(REFINED_THEME));
    await generateMenuTheme(new Uint8Array([0x25, 0x50, 0x44, 0x46]), "application/pdf");
    const firstContent = create.mock.calls[0]![0].messages[0].content;
    expect(firstContent[0].type).toBe("document");
    expect(firstContent[0].source.media_type).toBe("application/pdf");
  });
});
