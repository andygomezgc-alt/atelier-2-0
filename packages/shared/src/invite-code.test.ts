import { describe, expect, it } from "vitest";
import { generateInviteCode } from "./invite-code";

describe("generateInviteCode", () => {
  it("uses the first 6 letters of the restaurant name as slug", () => {
    const code = generateInviteCode("Ristorante Marche");
    expect(code).toMatch(/^RISTOR-[A-Z0-9]{4}$/);
  });

  it("strips spaces and punctuation", () => {
    const code = generateInviteCode("L'Étoile");
    // Only letters survive, diacritics stripped, padded if shorter than 6.
    expect(code).toMatch(/^LETOIL-[A-Z0-9]{4}$/);
  });

  it("falls back to ATELIER when name is empty", () => {
    expect(generateInviteCode("")).toMatch(/^ATELIER-[A-Z0-9]{4}$/);
    expect(generateInviteCode(null)).toMatch(/^ATELIER-[A-Z0-9]{4}$/);
    expect(generateInviteCode(undefined)).toMatch(/^ATELIER-[A-Z0-9]{4}$/);
  });

  it("falls back to ATELIER when name has no usable letters", () => {
    expect(generateInviteCode("123 - !!")).toMatch(/^ATELIER-[A-Z0-9]{4}$/);
  });

  it("produces a different suffix on each call", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      seen.add(generateInviteCode("Marche"));
    }
    // 50 calls × 36^4 ≈ 1.7M combos: collision is statistically improbable.
    expect(seen.size).toBeGreaterThan(40);
  });
});
