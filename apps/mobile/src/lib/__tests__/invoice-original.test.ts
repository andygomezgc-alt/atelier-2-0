import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ download: vi.fn(), share: vi.fn(), source: vi.fn() }));
vi.mock("expo-file-system/legacy", () => ({ cacheDirectory: "file:///cache/", downloadAsync: h.download }));
vi.mock("expo-sharing", () => ({ shareAsync: h.share }));
vi.mock("@/src/api/invoices", () => ({ invoicePageSource: h.source }));

import { openInvoicePdf } from "../invoice-original";

beforeEach(() => {
  vi.resetAllMocks();
  h.source.mockResolvedValue({ uri: "https://api/invoices/inv1/pages/0", headers: { Authorization: "Bearer tok" } });
  h.download.mockResolvedValue({ status: 200, uri: "file:///cache/invoice-inv1.pdf" });
});

describe("openInvoicePdf", () => {
  it("downloads the private PDF with the session token and opens it to share or view", async () => {
    await openInvoicePdf("inv1");
    expect(h.download).toHaveBeenCalledWith("https://api/invoices/inv1/pages/0", "file:///cache/invoice-inv1.pdf", { headers: { Authorization: "Bearer tok" } });
    expect(h.share).toHaveBeenCalledWith("file:///cache/invoice-inv1.pdf", { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
  });

  it("a refused download is an error and opens nothing", async () => {
    h.download.mockResolvedValue({ status: 503, uri: "file:///cache/invoice-inv1.pdf" });
    await expect(openInvoicePdf("inv1")).rejects.toThrow("invoice_pdf_http_503");
    expect(h.share).not.toHaveBeenCalled();
  });
});
