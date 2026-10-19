import { describe, expect, it } from "vitest";
import { lastPriceChangePct } from "./price-change";

const kg = (precio: number) => ({ precio, unidadCompra: "kg" as const });
const current = (precioCompra: number, unidadCompra: "kg" | "l" = "kg") => ({ precioCompra, unidadCompra });

describe("lastPriceChangePct", () => {
  it("returns the rise of the newest price over the previous one, rounded", () => {
    expect(lastPriceChangePct([kg(1120), kg(1000)], current(1120))).toBe(12);
  });

  it("returns a negative change for a drop", () => {
    expect(lastPriceChangePct([kg(950), kg(1000)], current(950))).toBe(-5);
  });

  it("is null without a previous price", () => {
    expect(lastPriceChangePct([kg(1000)], current(1000))).toBeNull();
    expect(lastPriceChangePct([], current(1000))).toBeNull();
  });

  it("is null when the previous price was zero", () => {
    expect(lastPriceChangePct([kg(1000), kg(0)], current(1000))).toBeNull();
  });

  it("is null when the two prices are in different units", () => {
    expect(lastPriceChangePct([kg(1000), { precio: 200, unidadCompra: "unidad" }], current(1000))).toBeNull();
  });

  it("is null when the newest entry no longer matches the current price or unit", () => {
    expect(lastPriceChangePct([kg(1120), kg(1000)], current(1300))).toBeNull();
    expect(lastPriceChangePct([kg(1120), kg(1000)], current(1120, "l"))).toBeNull();
  });

  it("is null when the change rounds to zero", () => {
    expect(lastPriceChangePct([kg(1003), kg(1000)], current(1003))).toBeNull();
  });
});
