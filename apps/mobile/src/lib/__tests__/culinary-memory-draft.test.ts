import { describe, expect, it } from "vitest";
import type { CulinaryMemoryResponse, MemoryPreference } from "@atelier/shared";
import {
  applyCuisineRegister, hasUnsavedRelearn, hideCategory, MEMORY_CATEGORY_KEYS, memoryCategory, memoryPatchBody, relearnCategory,
  setCorrection, showCategory,
} from "../culinary-memory-draft";

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

describe("memory categories", () => {
  const learnedFlavours: MemoryPreference = { key: "flavours", text: "Bright acidity" };
  const draft: CulinaryMemoryResponse = {
    ...base, learned: [learnedFlavours, { key: "textures", text: "Crunchy" }, { key: "cuisine", text: "Learned cuisine" }],
  };

  it("lists the seven keys in a fixed order", () => {
    expect(MEMORY_CATEGORY_KEYS).toEqual(["cuisine", "ingredients", "techniques", "flavours", "textures", "presentation", "complexity"]);
  });

  it("gives each category exactly one state, with the declaration winning over what was learned", () => {
    expect(memoryCategory(draft, "cuisine")).toEqual({ state: "declared", text: "Seasonal cooking" });
    expect(memoryCategory(draft, "flavours")).toEqual({ state: "learned", text: "Bright acidity" });
    expect(memoryCategory(draft, "textures")).toEqual({ state: "hidden", text: "" });
    expect(memoryCategory(draft, "complexity")).toEqual({ state: "empty", text: "" });
  });

  it("declares, hides and shows a single category", () => {
    const declared = setCorrection(draft, "complexity", "Few elements");
    expect(declared.corrections).toEqual([cuisineCorrection, techniqueCorrection, { key: "complexity", text: "Few elements" }]);
    expect(setCorrection(declared, "complexity", "").corrections.at(-1)).toEqual({ key: "complexity", text: "" });

    const hidden = hideCategory(draft, "techniques");
    expect(hidden.corrections).toEqual([cuisineCorrection]);
    expect(hidden.excludedKeys).toEqual(["textures", "techniques"]);

    expect(showCategory(hidden, "textures").excludedKeys).toEqual(["techniques"]);
  });
});

describe("cuisine register shortcut", () => {
  const phrases = ["Classic", "Contemporary", "Avant-garde"];

  it("starts an empty text with the register and a dash", () => {
    expect(applyCuisineRegister("", "Contemporary", phrases)).toBe("Contemporary — ");
    expect(applyCuisineRegister("   ", "Classic", phrases)).toBe("Classic — ");
  });

  it("replaces a leading register and keeps the rest", () => {
    expect(applyCuisineRegister("Classic — Marche seafood", "Avant-garde", phrases)).toBe("Avant-garde — Marche seafood");
  });

  it("puts the register before free text that has none", () => {
    expect(applyCuisineRegister("Marche seafood", "Classic", phrases)).toBe("Classic — Marche seafood");
  });

  it("never exceeds 160 characters", () => {
    expect(applyCuisineRegister("x".repeat(160), "Contemporary", phrases)).toHaveLength(160);
  });
});
