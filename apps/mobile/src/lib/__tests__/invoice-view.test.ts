import { describe, expect, it } from "vitest";
import type { InvoiceLineView } from "@atelier/shared";
import {
  buildHeaderPatch, failureKey, formatDay, formatDayInput, invoiceDay, lineState, parseDayInput, priceChange, undecidedPositions,
} from "../invoice-view";

const line = (over: Partial<InvoiceLineView> = {}): InvoiceLineView => ({
  position: 0, description: "Zucchine", code: null, quantity: 2, unit: "kg", packQty: null, packUnit: null,
  unitPriceCents: 180, taxRatePct: 4, lineTotalCents: 360, matchLevel: "exact", action: "update_price", appliedPriceCents: 180,
  product: { id: "p1", name: "Zucchine", unidadCompra: "kg", precioCompra: 150, taxRatePct: 4 },
  siblings: [], quantityLooksMisread: false, ...over,
});

describe("priceChange", () => {
  it("compares the bank price with the new one", () => {
    expect(priceChange(line())).toEqual({ beforeCents: 150, afterCents: 180, pct: 20 });
  });
  it("has nothing to compare without a product, a price or a previous price", () => {
    expect(priceChange(line({ product: null }))).toBeNull();
    expect(priceChange(line({ appliedPriceCents: null }))).toBeNull();
    expect(priceChange(line({ product: { id: "p1", name: "Z", unidadCompra: "kg", precioCompra: 0, taxRatePct: 0 } }))).toBeNull();
  });
});

describe("lineState", () => {
  it.each([
    [{}, "decided"],
    [{ action: null, matchLevel: "ambiguo" as const, product: null }, "ambiguous"],
    [{ action: null, matchLevel: "probable" as const }, "probable"],
    [{ action: null }, "tick"],
    [{ action: null, product: null }, "choose"],
  ])("%j is %s", (over, state) => expect(lineState(line(over))).toBe(state));

  it("counts the undecided lines", () => {
    expect(undecidedPositions([line(), line({ position: 3, action: null })])).toEqual([3]);
  });
});

it("an unknown failure reason reads as a generic one", () => {
  expect(failureKey("ai_quota")).toBe("invoice_failure_ai_quota");
  expect(failureKey("something_new")).toBe("invoice_failure_internal_error");
  expect(failureKey(null)).toBe("invoice_failure_internal_error");
});

describe("days", () => {
  it("uses the printed day, else the upload day", () => {
    expect(invoiceDay({ issuedOn: "2026-10-10", createdAt: "2026-10-11T08:00:00.000Z" })).toBe("2026-10-10");
    expect(invoiceDay({ issuedOn: null, createdAt: "2026-10-11T08:00:00.000Z" })).toBe("2026-10-11");
    expect(formatDay("2026-10-10", "es-ES")).toBe("10/10/2026");
  });

  it.each([["15/10/2026", "2026-10-15"], ["5.3.2026", "2026-03-05"], ["31/02/2026", null], ["2026-10-15", null], ["", null]])(
    "reads %j as %j", (raw, day) => expect(parseDayInput(raw)).toBe(day));

  it("writes a day the way the chef types it", () => expect(formatDayInput("2026-03-05")).toBe("05/03/2026"));
});

describe("buildHeaderPatch", () => {
  const invoice = { supplier: { id: "s1", name: "Recchioni" }, number: "77", issuedOn: "2026-10-10" };
  const same = { supplier: { kind: "existing" as const, id: "s1" }, number: "77", day: "10/10/2026" };

  it("sends nothing when nothing changed", () => expect(buildHeaderPatch(invoice, same)).toEqual({}));
  it("sends only what changed", () => {
    expect(buildHeaderPatch(invoice, { ...same, supplier: { kind: "existing", id: "s2" }, number: " 78 " })).toEqual({ supplierId: "s2", number: "78" });
    expect(buildHeaderPatch(invoice, { ...same, supplier: { kind: "new", name: " Garden Fruit " } })).toEqual({ supplierName: "Garden Fruit" });
    expect(buildHeaderPatch(invoice, { ...same, number: "", day: "" })).toEqual({ number: null, issuedOn: null });
    expect(buildHeaderPatch(invoice, { ...same, day: "11/10/2026" })).toEqual({ issuedOn: "2026-10-11" });
  });
  it("a day that does not exist is refused", () => expect(buildHeaderPatch(invoice, { ...same, day: "32/10/2026" })).toBe("invalid_date"));
});
