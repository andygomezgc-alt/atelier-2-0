import { expect, it, vi } from "vitest";
import { readReferenceGeometry, preserveReferencePageSize, referenceGeometryPrompt } from "./reference-geometry";
it("measures both Koko pages without assuming A4", async () => {
  const cleanup = vi.fn();
  const getPage = vi.fn(async () => ({ getViewport: () => ({ width: 612.283, height: 841.9 }), cleanup }));
  const reference = await readReferenceGeometry({ numPages: 2, getPage });
  expect(reference.pages).toEqual([{ widthMm: 216, heightMm: 297 }, { widthMm: 216, heightMm: 297 }]);
  expect(cleanup).toHaveBeenCalledTimes(2);
  expect(referenceGeometryPrompt(reference)).toContain("2: 216 × 297 mm");
});
it("keeps measured landscape orientation and existing margins", () => {
  expect(preserveReferencePageSize("@page{size:A4;margin:12mm}", { pages: [{ widthMm: 297, heightMm: 210 }] }))
    .toBe("@page{size:A4;margin:12mm}\n@page { size: 297mm 210mm; }");
});
it("does not flatten a PDF with mixed page formats", () => {
  expect(preserveReferencePageSize("existing", { pages: [{ widthMm: 210, heightMm: 297 }, { widthMm: 297, heightMm: 210 }] })).toBe("existing");
  expect(preserveReferencePageSize("photo")).toBe("photo");
});
it("rejects invalid page dimensions and frees the page", async () => {
  const cleanup = vi.fn();
  await expect(readReferenceGeometry({ numPages: 1, getPage: async () => ({ getViewport: () => ({ width: NaN, height: 200 }), cleanup }) }))
    .rejects.toThrow("menu_reference_page_size_invalid");
  expect(cleanup).toHaveBeenCalledOnce();
});
