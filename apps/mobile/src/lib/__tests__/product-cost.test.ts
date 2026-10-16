import { describe, expect, it } from "vitest";
import { parseTaxRatePct, realCostWithTax, suggestedMermaReason } from "../product-cost";

describe("realCostWithTax", () => {
  it("adds the purchase tax and spreads the waste, like the server", () => {
    expect(realCostWithTax(500, 20, 10)).toBeCloseTo((500 * 1.1) / 0.8, 6);
    expect(realCostWithTax(500, 0)).toBe(500);
  });
  it("has no real cost when nothing is usable", () => expect(realCostWithTax(500, 100, 4)).toBeNull());
});

describe("parseTaxRatePct", () => {
  it.each([["10", 10], ["10,5", 10.5], ["4 %", 4], ["0", 0], ["22.00", 22]])("reads %j as %s", (input, value) =>
    expect(parseTaxRatePct(input)).toBe(value));
  it.each([[""], ["abc"], ["101"], ["-4"], ["10,555"]])("refuses %j", (input) => expect(parseTaxRatePct(input)).toBeNull());
});

describe("suggestedMermaReason", () => {
  it("shows the reason only while the waste is still suggested", () => {
    expect(suggestedMermaReason({ mermaOrigen: "sugerida", mermaMotivo: "guscio e acqua" })).toBe("guscio e acqua");
    expect(suggestedMermaReason({ mermaOrigen: "confirmada", mermaMotivo: "guscio e acqua" })).toBeNull();
    expect(suggestedMermaReason({ mermaOrigen: "sugerida", mermaMotivo: null })).toBeNull();
    expect(suggestedMermaReason({ mermaOrigen: "sugerida" })).toBeNull();
  });
});
