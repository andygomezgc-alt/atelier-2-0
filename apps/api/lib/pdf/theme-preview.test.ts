import { beforeEach, describe, expect, it, vi } from "vitest";

const { renderHtmlToPdf, getDocumentProxy, getPage, destroy, cleanup } = vi.hoisted(() => ({
  renderHtmlToPdf: vi.fn(), getDocumentProxy: vi.fn(), getPage: vi.fn(),
  destroy: vi.fn(), cleanup: vi.fn(),
}));
vi.mock("./render", () => ({ renderHtmlToPdf }));
vi.mock("unpdf", () => ({ getDocumentProxy }));

import { renderThemePreview } from "./theme-preview";
const viewport = { width: 600, height: 840, convertToViewportPoint: (x: number, y: number) => [x, 840 - y] };
const item = (str: string, x = 40, width = 180) => ({ str, transform: [12, 0, 0, 12, x, 780], width, height: 12 });

beforeEach(() => {
  vi.clearAllMocks();
  renderHtmlToPdf.mockResolvedValue(Buffer.from("%PDF-preview"));
  getDocumentProxy.mockResolvedValue({ numPages: 2, getPage, destroy });
  getPage.mockImplementation(async (pageNumber: number) => ({
    getTextContent: async () => ({ items: [item(pageNumber === 1 ? "Antipasti Vitello" : "Primi Risotto ai funghi")] }),
    getViewport: () => viewport,
    cleanup,
  }));
});

describe("renderThemePreview", () => {
  it("rechaza una regla de página que cambió el formato medido del original", async () => {
    await expect(renderThemePreview("<html/>", [], { widthMm: 216, heightMm: 297 }))
      .rejects.toThrow("menu_theme_preview_page_size_mismatch");
    expect(destroy).toHaveBeenCalledOnce();
  });
  it("comprueba todas las páginas y devuelve los mismos bytes para visión", async () => {
    const pdf = await renderThemePreview("<html>menu</html>", ["Antipasti", "Vitello", "Primi", "Risotto ai funghi"]);
    expect(pdf.toString()).toBe("%PDF-preview");
    expect(getPage.mock.calls).toEqual([[1], [2]]);
    expect(cleanup).toHaveBeenCalledTimes(2);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("rechaza el PDF cuando se perdió un plato durante la impresión", async () => {
    await expect(renderThemePreview("<html/>", ["Branzino in crosta"]))
      .rejects.toThrow("menu_theme_preview_content_missing");
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("no envía a visión una muestra desmedida ni analiza sus páginas", async () => {
    getDocumentProxy.mockResolvedValueOnce({ numPages: 5, getPage, destroy });
    await expect(renderThemePreview("<html/>", []))
      .rejects.toThrow("menu_theme_preview_page_limit");
    expect(getPage).not.toHaveBeenCalled();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("limita bytes antes de abrir PDF.js", async () => {
    renderHtmlToPdf.mockResolvedValueOnce(Buffer.alloc(4 * 1024 * 1024 + 1));
    await expect(renderThemePreview("<html/>", []))
      .rejects.toThrow("menu_theme_preview_size_limit");
    expect(getDocumentProxy).not.toHaveBeenCalled();
  });

  it("libera el documento incluso si falla una página", async () => {
    getPage.mockRejectedValueOnce(new Error("invalid page"));
    await expect(renderThemePreview("<html/>", [])).rejects.toThrow("invalid page");
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("normaliza espacios de PDF y ligaduras sin omitir palabras", async () => {
    getDocumentProxy.mockResolvedValueOnce({ numPages: 1, getPage, destroy });
    getPage.mockResolvedValueOnce({
      getTextContent: async () => ({ items: [item("Filetto di"), item("manzo"), item("con conﬁt")] }),
      getViewport: () => viewport,
      cleanup,
    });
    await expect(renderThemePreview("<html/>", ["Filetto di manzo con confit"])).resolves.toBeDefined();
  });
  it("rechaza un precio que existe en el texto extraído pero se sale de la hoja", async () => {
    getPage.mockResolvedValueOnce({ getTextContent: async () => ({ items: [item("60,00 € / kg", 580, 90)] }), getViewport: () => viewport, cleanup });
    await expect(renderThemePreview("<html/>", ["60,00 € / kg"])).rejects.toThrow("menu_theme_preview_text_outside_page");
    expect(destroy).toHaveBeenCalledOnce();
  });
});
