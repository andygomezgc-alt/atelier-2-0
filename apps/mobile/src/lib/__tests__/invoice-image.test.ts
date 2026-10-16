import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ resize: vi.fn(), save: vi.fn(), info: vi.fn(), sizes: [] as number[] }));

vi.mock("expo-image-manipulator", () => ({
  SaveFormat: { JPEG: "jpeg" },
  ImageManipulator: {
    manipulate: () => {
      const context = { resize: (size: unknown) => { h.resize(size); return context; }, renderAsync: async () => ({ saveAsync: h.save }) };
      return context;
    },
  },
}));
vi.mock("expo-file-system/legacy", () => ({ getInfoAsync: h.info }));

import { InvoiceFileTooLargeError, prepareInvoiceFile } from "../invoice-image";

const MB = 1024 * 1024;

beforeEach(() => {
  vi.resetAllMocks();
  h.sizes = [2 * MB];
  let n = 0;
  h.save.mockImplementation(async () => ({ uri: `file:///out-${++n}.jpg` }));
  h.info.mockImplementation(async () => ({ exists: true, size: h.sizes.shift() ?? 2 * MB }));
});

describe("prepareInvoiceFile", () => {
  it("shrinks a 12 MP landscape photo to 2400 px wide JPEG", async () => {
    expect(await prepareInvoiceFile({ uri: "file:///a.jpg", mimeType: "image/jpeg", width: 4032, height: 3024 }))
      .toEqual({ uri: "file:///out-1.jpg", mimeType: "image/jpeg" });
    expect(h.resize).toHaveBeenCalledWith({ width: 2400 });
    expect(h.save).toHaveBeenCalledWith({ compress: 0.7, format: "jpeg" });
  });

  it("re-encodes a HEIC portrait photo as JPEG, 2400 px tall", async () => {
    expect(await prepareInvoiceFile({ uri: "file:///b.heic", mimeType: "image/heic", width: 3024, height: 4032 }))
      .toMatchObject({ mimeType: "image/jpeg" });
    expect(h.resize).toHaveBeenCalledWith({ height: 2400 });
  });

  it("never enlarges a small photo", async () => {
    await prepareInvoiceFile({ uri: "file:///c.png", mimeType: "image/png", width: 1200, height: 900 });
    expect(h.resize).not.toHaveBeenCalled();
    expect(h.save).toHaveBeenCalledTimes(1);
  });

  it("a photo still too heavy gets a second, smaller pass", async () => {
    h.sizes = [3.8 * MB, 1.5 * MB];
    expect(await prepareInvoiceFile({ uri: "file:///d.jpg", mimeType: "image/jpeg", width: 4000, height: 3000 }))
      .toEqual({ uri: "file:///out-2.jpg", mimeType: "image/jpeg" });
    expect(h.resize).toHaveBeenLastCalledWith({ width: 1800 });
    expect(h.save).toHaveBeenLastCalledWith({ compress: 0.5, format: "jpeg" });
  });

  it("a photo that never fits is refused", async () => {
    h.sizes = [5 * MB, 4.2 * MB];
    await expect(prepareInvoiceFile({ uri: "file:///e.jpg", mimeType: "image/jpeg", width: 4000, height: 3000 }))
      .rejects.toBeInstanceOf(InvoiceFileTooLargeError);
  });

  it("a PDF goes as it is up to 4 MB and is refused above", async () => {
    expect(await prepareInvoiceFile({ uri: "file:///f.pdf", mimeType: "application/pdf", size: 3 * MB }))
      .toEqual({ uri: "file:///f.pdf", mimeType: "application/pdf" });
    await expect(prepareInvoiceFile({ uri: "file:///g.pdf", mimeType: "application/pdf", size: 4 * MB + 1 }))
      .rejects.toBeInstanceOf(InvoiceFileTooLargeError);
    expect(h.save).not.toHaveBeenCalled();
  });

  it("a PDF without a reported size is measured on disk", async () => {
    h.sizes = [5 * MB];
    await expect(prepareInvoiceFile({ uri: "file:///h.PDF", mimeType: null })).rejects.toBeInstanceOf(InvoiceFileTooLargeError);
    expect(h.info).toHaveBeenCalledWith("file:///h.PDF");
  });
});
