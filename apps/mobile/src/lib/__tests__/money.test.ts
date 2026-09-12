import { expect, it } from "vitest";
import { formatEuros, formatEurosPerUnit, formatPrice, centsFromInput } from "../money";

it("shows effective per-gram prices without rounding them to whole cents", () => {
  expect(formatEuros(1.25, 4)).toBe("0,0125 €");
  expect(formatEurosPerUnit(1.25, "g", 4)).toBe("0,0125 €/g");
  expect(formatEuros(1250)).toBe("12,50 €");
});

it("preserves cents when a menu price is opened and saved", () => {
  for (const cents of [1250, 1299, 1200, 0]) expect(centsFromInput(formatPrice(cents))).toBe(cents);
});
