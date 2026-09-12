import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
vi.mock("../ai/budget", () => ({ reserveGeneration: vi.fn().mockResolvedValue({ id: "reservation" }), settleGeneration: vi.fn().mockResolvedValue(undefined) }));

const create = vi.fn();
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

// La vista previa usa Chromium y analiza el PDF; se prueba aparte.
const { renderThemePreview } = vi.hoisted(() => ({
  renderThemePreview: vi.fn(async (_html: string, _required: readonly string[], _size?: { widthMm: number; heightMm: number }) => Buffer.from("fake-pdf")),
}));
vi.mock("./theme-preview", async (importOriginal) => ({
  ...await importOriginal<typeof import("./theme-preview")>(), renderThemePreview,
}));
vi.mock("../logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { generateMenuTheme } from "./theme-generate";
import { MenuFontValidationError } from "./font-validation";
import { MenuThemePreviewError } from "./theme-preview";

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

function jsonReply(input: unknown, usage = {}, finish_reason = "stop") {
  return { choices: [{ finish_reason, message: { content: JSON.stringify(input) } }], usage };
}

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);

beforeEach(() => {
  create.mockReset();
  renderThemePreview.mockReset().mockResolvedValue(Buffer.from("fake-pdf"));
  vi.stubEnv("ZAI_API_KEY", "glm-test-key");
  vi.stubGlobal("fetch", vi.fn(async (_url, init) => Response.json(await create(JSON.parse(init.body)))));
});

describe("generateMenuTheme", () => {
  it("repara pérdida de platos en la carta extensa sin enviarla a visión", async () => {
    create.mockResolvedValue(jsonReply(VALID_THEME));
    renderThemePreview.mockResolvedValueOnce(Buffer.from("short-preview"))
      .mockRejectedValueOnce(new MenuThemePreviewError("menu_theme_preview_content_missing"));
    const result = await generateMenuTheme(JPEG, "image/jpeg");
    expect(result.refined).toBe(false);
    expect(create).toHaveBeenCalledTimes(2);
    expect(renderThemePreview).toHaveBeenCalledTimes(4);
    expect(renderThemePreview.mock.calls[1]![1]).toContain("Especial fuera de sección");
    expect(JSON.stringify(create.mock.calls[1])).toContain("25 platos");
    expect(JSON.stringify(create.mock.calls)).not.toContain(Buffer.from("short-preview").toString("base64"));
  });
  it("repara una fuente no disponible sin exceder dos llamadas", async () => {
    create.mockResolvedValue(jsonReply(VALID_THEME));
    renderThemePreview.mockRejectedValueOnce(new MenuFontValidationError(["variante no disponible Lato 700 italic"]));
    const result = await generateMenuTheme(JPEG, "image/jpeg");
    expect(result.refined).toBe(false);
    expect(create).toHaveBeenCalledTimes(2);
    expect(renderThemePreview).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(create.mock.calls[1])).toContain("Lato 700 italic");
  });

  it("rechaza dos intentos con fuentes inválidas sin una tercera llamada", async () => {
    create.mockResolvedValue(jsonReply(VALID_THEME));
    renderThemePreview.mockRejectedValue(new MenuFontValidationError(["familia no declarada Mae"]));
    await expect(generateMenuTheme(JPEG, "image/jpeg")).rejects.toThrow("Mae");
    expect(create).toHaveBeenCalledTimes(2);
  });
  it("conserva las medidas verificadas en generación y refinamiento sin más llamadas", async () => {
    create.mockResolvedValueOnce(jsonReply(VALID_THEME)).mockResolvedValueOnce(jsonReply(REFINED_THEME));
    const result = await generateMenuTheme(JPEG, "application/pdf", { referenceGeometry: { pages: [{ widthMm: 216, heightMm: 297 }, { widthMm: 216, heightMm: 297 }] } });
    expect(result.theme.css).toContain("@page { size: 216mm 297mm; }");
    expect(create).toHaveBeenCalledTimes(2);
    for (const [call] of create.mock.calls) {
      const prompt = call.messages[0].content;
      expect(prompt).toContain("2: 216 × 297 mm");
      expect(prompt).toContain("Revisá todas las páginas interiores");
    }
    const required = renderThemePreview.mock.calls[0]![1];
    expect(required).toEqual(expect.arrayContaining(["60,00 € / kg", "4,00 € a persona", "Coperto", "14,50 €"]));
    expect(renderThemePreview.mock.calls[0]![2]).toEqual({ widthMm: 216, heightMm: 297 });
  });
  it("happy path: genera + refina → devuelve el theme refinado con refined:true", async () => {
    create
      .mockResolvedValueOnce(jsonReply(VALID_THEME))
      .mockResolvedValueOnce(jsonReply(REFINED_THEME));

    const { theme, refined } = await generateMenuTheme(JPEG, "image/jpeg");

    expect(refined).toBe(true);
    expect(theme.css).toContain("#222"); // el refinado
    expect(create).toHaveBeenCalledTimes(2);
    expect(renderThemePreview).toHaveBeenCalledTimes(4);
    // La 2ª llamada lleva todas las páginas del PDF realmente impreso.
    const secondContent = create.mock.calls[1]![0].messages[1].content;
    const preview = secondContent.filter((b: { type: string }) => b.type === "image_url").at(-1);
    expect(preview.image_url.url).toBe(`data:image/png;base64,${Buffer.from("fake-pdf").toString("base64")}`);
    const instructions = create.mock.calls[1]![0].messages[0].content;
    expect(instructions).toContain(JSON.stringify(VALID_THEME));
    expect(instructions).toContain("SECTION_HEADER_HTML");
    expect(instructions).toContain("Catálogo de fuentes");
  });

  it("refine falla (2ª llamada tira) → theme v1 + refined:false, sin throw", async () => {
    create
      .mockResolvedValueOnce(jsonReply(VALID_THEME))
      .mockRejectedValueOnce(new Error("timeout refine"));

    const { theme, refined } = await generateMenuTheme(JPEG, "image/jpeg");

    expect(refined).toBe(false);
    expect(theme.css).toContain("#111"); // el v1
  });

  it("refine devuelve theme inválido → theme v1 + refined:false", async () => {
    create
      .mockResolvedValueOnce(jsonReply(VALID_THEME))
      .mockResolvedValueOnce(jsonReply({ ...VALID_THEME, fontTitle: "comic-sans" }));

    const { theme, refined } = await generateMenuTheme(JPEG, "image/jpeg");

    expect(refined).toBe(false);
    expect(theme.css).toContain("#111");
  });

  it("render inicial falla → rechaza el theme sin gastar la llamada de refinamiento", async () => {
    create.mockResolvedValueOnce(jsonReply(VALID_THEME));
    renderThemePreview.mockRejectedValueOnce(new Error("chromium down"));
    await expect(generateMenuTheme(JPEG, "image/jpeg")).rejects.toThrow("chromium down");
    // Nunca llegó a la 2ª llamada.
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("refinado que pierde platos al imprimir → conserva el primer theme comprobado", async () => {
    create.mockResolvedValueOnce(jsonReply(VALID_THEME)).mockResolvedValueOnce(jsonReply(REFINED_THEME));
    renderThemePreview.mockResolvedValueOnce(Buffer.from("first-pdf"))
      .mockResolvedValueOnce(Buffer.from("stress-pdf"))
      .mockRejectedValueOnce(new Error("menu_theme_preview_content_missing"));
    const result = await generateMenuTheme(JPEG, "image/jpeg");
    expect(result.refined).toBe(false);
    expect(result.theme.css).toContain("#111");
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("respuesta truncada rechaza incluso un bloque estructurado aparentemente válido", async () => {
    create.mockResolvedValueOnce(jsonReply(VALID_THEME, {}, "length"));
    await expect(generateMenuTheme(JPEG, "image/jpeg")).rejects.toThrow("menu_theme_response_incomplete");
    expect(renderThemePreview).not.toHaveBeenCalled();
  });

  it("refine truncado conserva v1 y registra el uso de ambas respuestas", async () => {
    const onUsage = vi.fn();
    create.mockResolvedValueOnce(jsonReply(VALID_THEME, { prompt_tokens: 110, completion_tokens: 80 }))
      .mockResolvedValueOnce(jsonReply(REFINED_THEME, { prompt_tokens: 220, completion_tokens: 90 }, "length"));
    const result = await generateMenuTheme(JPEG, "image/jpeg", { onUsage });
    expect(result.refined).toBe(false);
    expect(onUsage.mock.calls).toEqual([[110, 80], [220, 90]]);
  });

  it("fallo de medición no invalida un theme válido", async () => {
    create.mockResolvedValueOnce(jsonReply(VALID_THEME, { prompt_tokens: 5, completion_tokens: 6 }))
      .mockResolvedValueOnce(jsonReply(REFINED_THEME));
    const onUsage = vi.fn().mockRejectedValue(new Error("metrics down"));
    expect((await generateMenuTheme(JPEG, "image/jpeg", { onUsage })).refined).toBe(true);
    expect(onUsage).toHaveBeenCalledWith(5, 6);
  });

  it("theme inválido en la llamada 1 → throw (Zod lo rechaza)", async () => {
    create.mockResolvedValueOnce(jsonReply({ ...VALID_THEME, css: "corto" }));
    await expect(generateMenuTheme(JPEG, "image/jpeg")).rejects.toThrow();
  });

  it("llamada 1 estructuralmente inválida (frame sin CONTENT) → reintenta con feedback y usa el theme bueno", async () => {
    // Reproduce el bug real: frameHtml con {{HEADER}}{{SECTIONS}}{{FOOTER}} y sin
    // {{CONTENT}} → el render saldría vacío; la validación estructural lo caza.
    const BAD_STRUCT = {
      ...VALID_THEME,
      frameHtml: '<div class="p">{{HEADER}}{{SECTIONS}}{{FOOTER}}</div>',
    };
    create
      .mockResolvedValueOnce(jsonReply(BAD_STRUCT)) // call 1: rechazado
      .mockResolvedValueOnce(jsonReply(VALID_THEME)); // retry: bueno
    const { theme, refined } = await generateMenuTheme(JPEG, "image/jpeg");
    expect(theme.frameHtml).toBeNull(); // el bueno (VALID_THEME.frameHtml null)
    expect(refined).toBe(false);
    expect(create).toHaveBeenCalledTimes(2); // reparación consume el presupuesto de refine
    expect(renderThemePreview).toHaveBeenCalledTimes(2);

    // La 2ª llamada llevó el motivo del rechazo como feedback en el prompt.
    const retryText = create.mock.calls[1]![0].messages[0].content;
    expect(retryText).toMatch(/RECHAZAD/i);
    expect(retryText).toMatch(/CONTENT/);
  });

  it("ambas llamadas estructuralmente inválidas → throw (1 + retry, sin refine)", async () => {
    const BAD = { ...VALID_THEME, frameHtml: "<div>{{HEADER}}</div>" };
    create.mockResolvedValueOnce(jsonReply(BAD)).mockResolvedValueOnce(jsonReply(BAD));
    await expect(generateMenuTheme(JPEG, "image/jpeg")).rejects.toThrow();
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("PDF → páginas como imágenes en la 1ª llamada", async () => {
    create
      .mockResolvedValueOnce(jsonReply(VALID_THEME))
      .mockResolvedValueOnce(jsonReply(REFINED_THEME));
    await generateMenuTheme(new Uint8Array([0x25, 0x50, 0x44, 0x46]), "application/pdf");
    const firstContent = create.mock.calls[0]![0].messages[1].content;
    expect(firstContent[0].type).toBe("image_url");
    expect(firstContent[0].image_url.url).toMatch(/^data:image\/png;base64,/);
    const prompt = create.mock.calls[0]![0].messages[0].content;
    expect(prompt).toContain("conservá tamaño, orientación y proporciones mediante @page");
    expect(prompt).toContain("si no puede inferirse, usá A4");
  });
});

vi.mock("../ai/media", () => ({ visionParts: vi.fn(async (buffer: Uint8Array, mime: string) => [
  { type: "image_url", image_url: { url: `data:${mime === "application/pdf" ? "image/png" : mime};base64,${Buffer.from(buffer).toString("base64")}` } },
]) }));
