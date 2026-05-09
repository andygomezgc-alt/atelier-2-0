import { describe, expect, it } from "vitest";
import { generateInviteCode } from "./invite-code";

// Unambiguous alphabet (no 0/O, no 1/I/L): A-H,J,K,M,N,P-Z,2-9.
const SUFFIX_RE = /^[A-HJKMNP-Z2-9]{6}$/;

describe("generateInviteCode", () => {
  it("uses the first 6 letters of the restaurant name as slug", () => {
    const code = generateInviteCode("Ristorante Marche");
    expect(code).toMatch(/^RISTOR-[A-HJKMNP-Z2-9]{6}$/);
  });

  it("strips spaces and punctuation", () => {
    const code = generateInviteCode("L'Étoile");
    // Only letters survive, diacritics stripped, padded if shorter than 6.
    expect(code).toMatch(/^LETOIL-[A-HJKMNP-Z2-9]{6}$/);
  });

  it("falls back to ATELIER when name is empty", () => {
    expect(generateInviteCode("")).toMatch(/^ATELIER-[A-HJKMNP-Z2-9]{6}$/);
    expect(generateInviteCode(null)).toMatch(/^ATELIER-[A-HJKMNP-Z2-9]{6}$/);
    expect(generateInviteCode(undefined)).toMatch(/^ATELIER-[A-HJKMNP-Z2-9]{6}$/);
  });

  it("falls back to ATELIER when name has no usable letters", () => {
    expect(generateInviteCode("123 - !!")).toMatch(/^ATELIER-[A-HJKMNP-Z2-9]{6}$/);
  });

  it("produces a different suffix on each call", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const code = generateInviteCode("Marche");
      expect(code.split("-")[1]).toMatch(SUFFIX_RE);
      seen.add(code);
    }
    // 50 calls × 31^6 ≈ 887M combos: collision is statistically improbable.
    expect(seen.size).toBeGreaterThan(40);
  });
});
