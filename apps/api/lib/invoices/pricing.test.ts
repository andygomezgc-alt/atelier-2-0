import { describe, expect, it } from "vitest";
import { normalizeInvoiceUnit, priceInBankUnit, proposeLine } from "./pricing";

describe("normalizeInvoiceUnit", () => {
  it.each([
    ["kg", "kg"], ["KG", "kg"], ["kilo", "kg"], ["gr", "g"], ["lt", "l"], ["ml", "ml"],
    ["pz", "unidad"], ["pezzi", "unidad"], ["unid.", "unidad"], ["pcs", "unidad"],
    ["cassa", "caja"], ["cartone", "caja"], ["box", "caja"], ["ct", "caja"],
    ["mazzo", null], [null, null], ["", null],
  ])("%j -> %j", (raw, expected) => {
    expect(normalizeInvoiceUnit(raw)).toBe(expected);
  });
});

describe("priceInBankUnit", () => {
  const p = (
    unitPriceCents: number | null,
    unit: string | null,
    packQty: number | null = null,
    packUnit: string | null = null,
    quantity: number | null = null,
    lineTotalCents: number | null = null,
  ) => ({ unitPriceCents, unit, packQty, packUnit, quantity, lineTotalCents });

  it("same unit passes through", () => expect(priceInBankUnit(p(1250, "kg"), "kg")).toBe(1250));
  it("grams to kilos", () => expect(priceInBankUnit(p(2, "g"), "kg")).toBe(2000));
  it("kilos to grams rounds to the cent", () => expect(priceInBankUnit(p(1250, "kg"), "g")).toBe(1));
  it("a case with known content becomes a price per kilo", () => expect(priceInBankUnit(p(4000, "cassa", 5, "kg"), "kg")).toBe(800));
  it("a case with content in grams, bank in kilos", () => expect(priceInBankUnit(p(1200, "cassa", 500, "g"), "kg")).toBe(2400));
  it("a case without content, bank in kilos: unsafe", () => expect(priceInBankUnit(p(4000, "cassa"), "kg")).toBeNull());
  it("a case bought by the case stays per case", () => expect(priceInBankUnit(p(4000, "cassa"), "caja")).toBe(4000));
  it("weight to volume without density: unsafe", () => expect(priceInBankUnit(p(900, "kg"), "l")).toBeNull());
  it("unknown unit: unsafe", () => expect(priceInBankUnit(p(300, "mazzo"), "unidad")).toBeNull());
  it("no price (delivery note): null", () => expect(priceInBankUnit(p(null, "kg"), "kg")).toBeNull());
  it("negative or zero price (discount, deposit): null", () => {
    expect(priceInBankUnit(p(-500, "kg"), "kg")).toBeNull();
    expect(priceInBankUnit(p(0, "kg"), "kg")).toBeNull();
  });
});

describe("proposeLine", () => {
  const base = { productId: "p1", currentPriceCents: 1000, currentPriceAt: new Date("2026-10-01T09:00:00Z"), invoiceDate: "2026-10-12" };

  it("no product: create a draft, with the price if known", () => {
    expect(proposeLine({ ...base, productId: null, newPriceCents: 800 })).toEqual({ action: "create_draft", priceCents: 800, preselected: true });
    expect(proposeLine({ ...base, productId: null, newPriceCents: null })).toEqual({ action: "create_draft", priceCents: null, preselected: true });
  });

  it("unsafe conversion: connect without price", () => {
    expect(proposeLine({ ...base, newPriceCents: null })).toEqual({ action: "connect", priceCents: null, reason: "unsafe_conversion" });
  });

  it("small change is pre-selected", () => {
    expect(proposeLine({ ...base, newPriceCents: 1190 })).toEqual({ action: "update_price", priceCents: 1190, changePct: 19, preselected: true });
  });

  it("20% or more needs an explicit tick, both directions", () => {
    expect(proposeLine({ ...base, newPriceCents: 1200 })).toMatchObject({ action: "update_price", changePct: 20, preselected: false });
    expect(proposeLine({ ...base, newPriceCents: 700 })).toMatchObject({ action: "update_price", changePct: -30, preselected: false });
  });

  it("product without a price yet: update, pre-selected, no change %", () => {
    expect(proposeLine({ ...base, currentPriceCents: 0, newPriceCents: 800 })).toEqual({ action: "update_price", priceCents: 800, changePct: null, preselected: true });
  });

  it("same price: connect only", () => {
    expect(proposeLine({ ...base, newPriceCents: 1000 })).toEqual({ action: "connect", priceCents: null, reason: "same_price" });
  });

  it("an older invoice never overwrites the current price", () => {
    expect(proposeLine({ ...base, invoiceDate: "2026-09-30", newPriceCents: 1100 })).toEqual({ action: "connect", priceCents: null, reason: "older_invoice" });
  });

  it("an invoice from the same day as the current price still updates", () => {
    expect(proposeLine({ ...base, invoiceDate: "2026-10-01", newPriceCents: 1100 })).toMatchObject({ action: "update_price", priceCents: 1100 });
  });
});

describe("price actually paid", () => {
  const line = (unitPriceCents: number | null, quantity: number | null, lineTotalCents: number | null) =>
    ({ unitPriceCents, unit: "kg", packQty: null, packUnit: null, quantity, lineTotalCents });

  it("a line discount wins over the list price", () => expect(priceInBankUnit(line(1000, 1, 850), "kg")).toBe(850));
  it("rounding differences keep the printed unit price", () => expect(priceInBankUnit(line(333, 3, 1000), "kg")).toBe(333));
  it("no unit price: derived from total / quantity", () => expect(priceInBankUnit(line(null, 2, 1250), "kg")).toBe(625));
  it("a return line (negative quantity) is never a price", () => expect(priceInBankUnit(line(625, -2, -1250), "kg")).toBeNull());
  it("a negative line total is never a price", () => expect(priceInBankUnit(line(625, 2, -1250), "kg")).toBeNull());
});

describe("unpriced products", () => {
  it("a product without a price created after the invoice still takes the invoice price", () => {
    expect(proposeLine({
      productId: "p", currentPriceCents: 0, currentPriceAt: new Date("2026-10-15T08:00:00Z"),
      newPriceCents: 800, invoiceDate: "2026-10-13",
    })).toEqual({ action: "update_price", priceCents: 800, changePct: null, preselected: true });
  });
});
