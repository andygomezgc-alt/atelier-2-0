import { describe, expect, it } from "vitest";
import type { CulinaryMemoryResponse, MemoryPreference } from "@atelier/shared";
import { hasUnsavedRelearn, memoryPatchBody, relearnCategory } from "../culinary-memory-draft";

const cuisineCorrection: MemoryPreference = { key: "cuisine", text: "Seasonal cooking" };
const techniqueCorrection: MemoryPreference = { key: "techniques", text: "Slow cooking" };
const base: CulinaryMemoryResponse = {
  restaurantId: "restaurant-1",
  version: 1,
  enabled: true,
  identityLine: null,
  city: null,
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

  it("builds the patch body from the saved version and the draft, trimming the city", () => {
    const draft = { ...base, identityLine: "Sea cooking", city: "  Ancona, Marche  " };

    expect(memoryPatchBody({ ...base, version: 3 }, draft)).toEqual({
      expectedVersion: 3,
      enabled: true,
      identityLine: "Sea cooking",
      city: "Ancona, Marche",
      corrections: [cuisineCorrection, techniqueCorrection],
      excludedKeys: ["textures"],
    });
  });

  it("sends a null city when the draft city is blank", () => {
    expect(memoryPatchBody(base, { ...base, city: "   " }).city).toBeNull();
    expect(memoryPatchBody(base, { ...base, city: null }).city).toBeNull();
  });
});
