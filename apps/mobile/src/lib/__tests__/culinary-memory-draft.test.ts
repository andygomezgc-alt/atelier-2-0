import { describe, expect, it } from "vitest";
import type { CulinaryMemoryResponse, MemoryPreference } from "@atelier/shared";
import { hasUnsavedRelearn, relearnCategory } from "../culinary-memory-draft";

const cuisineCorrection: MemoryPreference = { key: "cuisine", text: "Seasonal cooking" };
const techniqueCorrection: MemoryPreference = { key: "techniques", text: "Slow cooking" };
const base: CulinaryMemoryResponse = {
  restaurantId: "restaurant-1",
  version: 1,
  enabled: true,
  identityLine: null,
  learned: [],
  corrections: [cuisineCorrection, techniqueCorrection],
  excludedKeys: ["textures"],
  updatedAt: null,
  canEdit: true,
  learningAvailable: true,
};

describe("culinary memory draft", () => {
  it("removes only the selected correction without excluding its category", () => {
    const result = relearnCategory(base, "cuisine");

    expect(result).not.toBe(base);
    expect(result).toEqual({ ...base, corrections: [techniqueCorrection] });
    expect(result.excludedKeys).toBe(base.excludedKeys);
  });

  it("detects a relearn pending save but not a hidden or saved correction", () => {
    const relearned = relearnCategory(base, "cuisine");

    expect(hasUnsavedRelearn(base, relearned)).toBe(true);
    expect(hasUnsavedRelearn(relearned, relearned)).toBe(false);
    expect(hasUnsavedRelearn(base, { ...relearned, excludedKeys: [...relearned.excludedKeys, "cuisine"] })).toBe(false);
  });
});
