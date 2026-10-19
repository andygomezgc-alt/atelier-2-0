// Proposal 1: the recipe list colours food cost by how healthy it is for a kitchen.
import { describe, expect, it } from "vitest";
import { foodCostTone } from "../food-cost";

describe("foodCostTone", () => {
  it("is good up to 30%, a warning up to 35% and high above", () => {
    expect(foodCostTone(0)).toBe("good");
    expect(foodCostTone(30)).toBe("good");
    expect(foodCostTone(31)).toBe("warn");
    expect(foodCostTone(35)).toBe("warn");
    expect(foodCostTone(36)).toBe("high");
    expect(foodCostTone(140)).toBe("high");
  });

  it("has no tone when the food cost is unknown", () => {
    expect(foodCostTone(null)).toBeNull();
    expect(foodCostTone(undefined)).toBeNull();
  });
});
