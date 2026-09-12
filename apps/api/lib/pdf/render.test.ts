import { beforeEach, describe, expect, it, vi } from "vitest";

const { page, browser, launch } = vi.hoisted(() => {
  const page = {
    setRequestInterception: vi.fn(), on: vi.fn(), setJavaScriptEnabled: vi.fn(),
    emulateMediaType: vi.fn(), setContent: vi.fn(), evaluate: vi.fn(),
    pdf: vi.fn(),
  };
  const browser = { newPage: vi.fn(async () => page), close: vi.fn() };
  return { page, browser, launch: vi.fn(async () => browser) };
});
vi.mock("puppeteer", () => ({ launch }));
vi.mock("puppeteer-core", () => ({ launch }));
vi.mock("@sparticuz/chromium", () => ({ default: { args: [], executablePath: async () => "chromium" } }));

import { renderHtmlToPdf } from "./render";

beforeEach(() => {
  vi.clearAllMocks();
  page.evaluate.mockResolvedValue([]);
  page.pdf.mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
});

describe("renderHtmlToPdf", () => {
  it("rechaza fuentes fallidas antes de imprimir y cierra Chromium", async () => {
    page.evaluate.mockResolvedValueOnce(["falló cargar Lato"]);
    await expect(renderHtmlToPdf("<html/>")).rejects.toThrow("falló cargar Lato");
    expect(page.pdf).not.toHaveBeenCalled();
    expect(browser.close).toHaveBeenCalledOnce();
  });
  it("imprime según @page y mantiene el HTML inerte sin red", async () => {
    expect((await renderHtmlToPdf("<html>menu</html>")).toString()).toBe("%PDF");
    expect(page.setJavaScriptEnabled).toHaveBeenCalledWith(false);
    expect(page.emulateMediaType).toHaveBeenCalledWith("print");
    expect(page.pdf).toHaveBeenCalledWith(expect.objectContaining({
      format: "A4", preferCSSPageSize: true, printBackground: true, timeout: 30_000,
    }));
    const intercept = page.on.mock.calls.find(([event]) => event === "request")![1];
    for (const url of ["https://attacker.test/a", "http://localhost:3000/", "file:///secret", "blob:external"]) {
      const req = { url: () => url, continue: vi.fn(), abort: vi.fn() };
      intercept(req);
      expect(req.abort).toHaveBeenCalledOnce();
      expect(req.continue).not.toHaveBeenCalled();
    }
    for (const url of ["about:blank", "data:image/png;base64,eA=="]) {
      const req = { url: () => url, continue: vi.fn(), abort: vi.fn() };
      intercept(req);
      expect(req.continue).toHaveBeenCalledOnce();
      expect(req.abort).not.toHaveBeenCalled();
    }
    expect(browser.close).toHaveBeenCalledOnce();
  });

  it("cierra Chromium si falla la impresión", async () => {
    page.pdf.mockRejectedValueOnce(new Error("print failed"));
    await expect(renderHtmlToPdf("<html/>")).rejects.toThrow("print failed");
    expect(browser.close).toHaveBeenCalledOnce();
  });
});
