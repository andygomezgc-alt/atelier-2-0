import { describe, expect, it } from "vitest";
import type { ExtractedInvoicePage } from "./extraction";
import { checkInvoiceTotals, mergeInvoicePages } from "./totals";

const l = (lineTotalCents: number | null, taxRatePct: number | null = null) => ({ lineTotalCents, taxRatePct });

describe("checkInvoiceTotals", () => {
  it("ok when lines add up to the net total", () =>
    expect(checkInvoiceTotals([l(4000), l(1250)], { netTotalCents: 5250, grossTotalCents: null })).toEqual({ status: "ok", sumCents: 5250, diffCents: 0 }));
  it("tolerates rounding of one cent per line", () =>
    expect(checkInvoiceTotals([l(4003), l(3583), l(5994)], { netTotalCents: 13582, grossTotalCents: null }).status).toBe("ok"));
  it("mismatch when a line is missing", () =>
    expect(checkInvoiceTotals([l(4000)], { netTotalCents: 5250, grossTotalCents: null })).toEqual({ status: "mismatch", sumCents: 4000, diffCents: -1250 }));
  it("counts discount and deposit lines with their sign", () =>
    expect(checkInvoiceTotals([l(5000), l(-500), l(258)], { netTotalCents: 4758, grossTotalCents: null }).status).toBe("ok"));
  it("lines without a total are left out instead of making the check unknown", () =>
    expect(checkInvoiceTotals([l(null), l(4000), l(1250)], { netTotalCents: 5250, grossTotalCents: null }).status).toBe("ok"));
  it("unknown when no line has a total", () =>
    expect(checkInvoiceTotals([l(null)], { netTotalCents: 5250, grossTotalCents: null }).status).toBe("unknown"));
  it("unknown when no total is printed", () =>
    expect(checkInvoiceTotals([l(4000, 10)], { netTotalCents: null, grossTotalCents: null }).status).toBe("unknown"));
  it("checks the gross total when only the gross is printed and every line has a rate", () =>
    expect(checkInvoiceTotals([l(14200, 10)], { netTotalCents: null, grossTotalCents: 15620 }).status).toBe("ok"));
  it("a net that matches the lines but a gross that does not is a mismatch (computed net)", () =>
    expect(checkInvoiceTotals([l(4400, 22), l(2400, 22), l(36500, 10)], { netTotalCents: 43300, grossTotalCents: 49026 }))
      .toEqual({ status: "mismatch", sumCents: 43300, diffCents: -580 }));
  it("skips the gross check when a priced line has no rate", () =>
    expect(checkInvoiceTotals([l(4000, 10), l(1250)], { netTotalCents: 5250, grossTotalCents: 99999 }).status).toBe("ok"));
});

const page = (over: Partial<ExtractedInvoicePage>): ExtractedInvoicePage => ({
  isInvoice: true, supplierName: null, supplierTaxId: null, invoiceNumber: null, invoiceDate: null,
  netTotalCents: null, taxTotalCents: null, grossTotalCents: null, lines: [], droppedLines: 0, ...over,
});
const line = (description: string) => ({
  description, code: null, quantity: 1, unit: "kg", packQty: null, packUnit: null,
  unitPriceCents: 100, taxRatePct: 10, lineTotalCents: 100, kind: "item" as const,
});

describe("mergeInvoicePages", () => {
  it("lines from every page in order, identity from the first page that has it, totals from the last", () => {
    const merged = mergeInvoicePages([
      page({ supplierName: "SCELGO SPA", invoiceNumber: "0326413/20", invoiceDate: "2026-03-26", lines: [line("TONNO"), line("RICCIOLA")], droppedLines: 1 }),
      page({ supplierName: "Scelgo SPA (C&C San Benedetto)", netTotalCents: 61650, grossTotalCents: 68534 }),
    ]);
    expect(merged.header).toEqual({
      supplierName: "SCELGO SPA", supplierTaxId: null, invoiceNumber: "0326413/20", invoiceDate: "2026-03-26",
      netTotalCents: 61650, taxTotalCents: null, grossTotalCents: 68534,
    });
    expect(merged.lines.map((x) => x.description)).toEqual(["TONNO", "RICCIOLA"]);
    expect(merged.droppedLines).toBe(1);
    expect(merged.invoicePages).toBe(2);
  });

  it("pages that are not an invoice add nothing", () => {
    const merged = mergeInvoicePages([page({ isInvoice: false, supplierName: "Selfie", lines: [line("x")] }), page({ supplierName: "MARR" })]);
    expect(merged.header.supplierName).toBe("MARR");
    expect(merged.lines).toEqual([]);
    expect(merged.invoicePages).toBe(1);
  });
});
