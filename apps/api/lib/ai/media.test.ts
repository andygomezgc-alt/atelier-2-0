import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { doc, page, render, getDocument } = vi.hoisted(() => {
  const page = { getViewport: vi.fn(() => ({ width: 595, height: 842 })), cleanup: vi.fn() };
  const doc = { numPages: 2, getPage: vi.fn(async () => page), destroy: vi.fn(async () => {}) };
  return { doc, page, render: vi.fn(), getDocument: vi.fn(async (_bytes: Uint8Array, _options?: unknown) => doc) };
});
vi.mock("unpdf", () => ({ getDocumentProxy: getDocument, renderPageAsImage: render, createIsomorphicCanvasFactory: vi.fn(async () => class {}) }));
import { visionParts } from "./media";
beforeEach(() => {
  vi.clearAllMocks(); doc.numPages = 2;
  render.mockReset().mockImplementation(async (_doc, number) => `data:image/png;base64,${Buffer.from(`page-${number}`).toString("base64")}`);
});
afterEach(() => vi.unstubAllGlobals());
describe("GLM visual input", () => {
  it("sends all PDF pages in order, bounds pixel size, and preserves the input buffer", async () => {
    const pdf = new Uint8Array([37, 80, 68, 70]);
    const parts = await visionParts(pdf, "application/pdf");
    expect(parts).toHaveLength(4);
    expect(parts[0]).toEqual({ type: "text", text: "Página 1 de 2 del documento." });
    expect(parts[2]).toEqual({ type: "text", text: "Página 2 de 2 del documento." });
    expect(render.mock.calls.map(call => call[1])).toEqual([1, 2]);
    expect(render.mock.calls[0]![2].scale * 842).toBeCloseTo(2200);
    expect(getDocument.mock.calls[0]![0]).not.toBe(pdf);
    expect([...pdf]).toEqual([37, 80, 68, 70]);
    expect(doc.destroy).toHaveBeenCalledOnce();
  });
  it("rejects oversized page counts without silently dropping pages", async () => {
    doc.numPages = 11;
    await expect(visionParts(new Uint8Array([1]), "application/pdf")).rejects.toThrow("ai_media_page_limit");
    expect(render).not.toHaveBeenCalled(); expect(doc.destroy).toHaveBeenCalledOnce();
  });
  it("releases the document when rendering fails", async () => {
    render.mockRejectedValue(new Error("render failed"));
    await expect(visionParts(new Uint8Array([1]), "application/pdf")).rejects.toThrow("render failed");
    expect(doc.destroy).toHaveBeenCalledOnce();
  });
  it("passes image MIME and data intact and performs no network call", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    expect(await visionParts(new Uint8Array([1, 2]), "image/webp")).toEqual([{ type: "image_url", image_url: { url: "data:image/webp;base64,AQI=" } }]);
    expect(fetcher).not.toHaveBeenCalled(); expect(getDocument).not.toHaveBeenCalled();
  });
  it("rejects unsupported and excessive inputs", async () => {
    await expect(visionParts(new Uint8Array([1]), "text/html")).rejects.toThrow("ai_media_type_invalid");
    await expect(visionParts(new Uint8Array(7 * 1024 * 1024), "image/jpeg")).rejects.toThrow("ai_media_size_limit");
  });
});
