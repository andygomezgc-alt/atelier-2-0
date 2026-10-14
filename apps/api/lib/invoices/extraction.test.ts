// Invoice page reading. The provider is mocked: these tests cover the request
// each call builds, lenient number parsing and per-line validation.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { glm } = vi.hoisted(() => ({ glm: { generateGlmJson: vi.fn() } }));
vi.mock("../ai/glm", () => glm);
vi.mock("../ai/media", () => ({
  visionParts: vi.fn(async () => [{ type: "image_url", image_url: { url: "data:image/png;base64,AA==" } }]),
}));

import {
  InvoiceExtractionError,
  extractInvoicePage,
  parseInvoicePage,
  parseLenientNumber,
} from "./extraction";

const PAGE = {
  isInvoice: true,
  supplierName: "Pescheria Mazara",
  supplierTaxId: "IT01234567890",
  invoiceNumber: "123/A",
  invoiceDate: "2026-10-12",
  netTotal: 52.5,
  taxTotal: 5.25,
  grossTotal: 57.75,
  lines: [
    { description: "Gamb.rosso mazara cal.3", code: "GR3", quantity: 1, unit: "cassa", packQty: 5, packUnit: "kg", unitPrice: 40, taxRatePct: 10, lineTotal: 40 },
    { description: "Limoni", quantity: 2, unit: "kg", unitPrice: "6,25", taxRatePct: 4, lineTotal: "12,50" },
  ],
};

beforeEach(() => {
  glm.generateGlmJson.mockReset();
  glm.generateGlmJson.mockResolvedValue(PAGE);
});

describe("parseLenientNumber", () => {
  it.each([
    [12.5, 12.5],
    ["12,50", 12.5],
    ["1.234,50", 1234.5],
    ["1,234.50", 1234.5],
    ["€ 7.20", 7.2],
    ["-3,00", -3],
    ["", null],
    ["abc", null],
    [null, null],
    [undefined, null],
  ])("%j -> %j", (input, expected) => {
    expect(parseLenientNumber(input)).toBe(expected);
  });
});

describe("parseInvoicePage", () => {
  it("converts amounts to cents and keeps the raw unit and pack", () => {
    const page = parseInvoicePage(PAGE);
    expect(page.netTotalCents).toBe(5250);
    expect(page.grossTotalCents).toBe(5775);
    expect(page.lines[0]).toEqual({
      description: "Gamb.rosso mazara cal.3", code: "GR3", quantity: 1, unit: "cassa",
      packQty: 5, packUnit: "kg", unitPriceCents: 4000, taxRatePct: 10, lineTotalCents: 4000,
    });
    expect(page.lines[1]!.unitPriceCents).toBe(625);
    expect(page.lines[1]!.lineTotalCents).toBe(1250);
  });

  it("keeps a delivery-note line without prices, with nulls", () => {
    const page = parseInvoicePage({ ...PAGE, lines: [{ description: "Vongole veraci" }] });
    expect(page.lines).toEqual([{
      description: "Vongole veraci", code: null, quantity: null, unit: null, packQty: null,
      packUnit: null, unitPriceCents: null, taxRatePct: null, lineTotalCents: null,
    }]);
    expect(page.droppedLines).toBe(0);
  });

  it("never invents a tax rate the model did not read", () => {
    const page = parseInvoicePage({ ...PAGE, lines: [{ description: "Olio", unitPrice: 9 }] });
    expect(page.lines[0]!.taxRatePct).toBeNull();
  });

  it("drops malformed lines, counts them and keeps the rest", () => {
    const page = parseInvoicePage({ ...PAGE, lines: [{ description: "" }, "garbage", PAGE.lines[1]] });
    expect(page.lines).toHaveLength(1);
    expect(page.lines[0]!.description).toBe("Limoni");
    expect(page.droppedLines).toBe(2);
  });

  it("nulls an invoice date that is not YYYY-MM-DD", () => {
    expect(parseInvoicePage({ ...PAGE, invoiceDate: "12/10/2026" }).invoiceDate).toBeNull();
  });

  it("reports a non-invoice page", () => {
    expect(parseInvoicePage({ isInvoice: false, lines: [] }).isInvoice).toBe(false);
  });

  it("throws invoice_response_invalid on a non-object", () => {
    expect(() => parseInvoicePage("nope")).toThrow(InvoiceExtractionError);
    expect(() => parseInvoicePage("nope")).toThrow("invoice_response_invalid");
  });
});

describe("extractInvoicePage", () => {
  it("sends the image, the schema and the incomplete code", async () => {
    await extractInvoicePage(new Uint8Array([1]), "image/png");
    const req = glm.generateGlmJson.mock.calls[0]![0] as { task: string; schema: { properties: Record<string, unknown> }; incompleteCode: string; content: unknown[] };
    expect(req.task).toBe("extraction");
    expect(Object.keys(req.schema.properties)).toContain("lines");
    expect(req.incompleteCode).toBe("invoice_extraction_incomplete");
    expect(req.content[0]).toMatchObject({ type: "image_url" });
  });

  it("retries once when the first answer is broken JSON", async () => {
    glm.generateGlmJson.mockRejectedValueOnce(new Error("ai_response_invalid"));
    const page = await extractInvoicePage(new Uint8Array([1]), "image/png");
    expect(glm.generateGlmJson).toHaveBeenCalledTimes(2);
    expect(page.lines).toHaveLength(2);
  });

  it("does not retry other errors", async () => {
    glm.generateGlmJson.mockRejectedValueOnce(new Error("ai_budget_exhausted"));
    await expect(extractInvoicePage(new Uint8Array([1]), "image/png")).rejects.toThrow("ai_budget_exhausted");
    expect(glm.generateGlmJson).toHaveBeenCalledTimes(1);
  });
});
