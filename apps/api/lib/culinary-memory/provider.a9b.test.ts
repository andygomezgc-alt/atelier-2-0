import { describe, expect, it } from "vitest";
import type { Evidence } from "./evidence";
import { MEMORY_PAYLOAD_CHAR_LIMIT } from "./limits";
import { memoryPayload, type MemoryInput } from "./provider";

const evidenceOf = (n: number): Evidence => ({
  id: `recipe-${n}`, hash: `hash-${n}`, duplicateKey: `distinct-${n}`,
  legacyHashes: { approved: `a-${n}`, in_test: `t-${n}` }, state: "approved",
  title: `Recipe ${n} ` + "t".repeat(120),
  ingredients: ["i".repeat(300)],
  method: ["m".repeat(320)],
});
const inputOf = (evidence: Evidence[], corrections: MemoryInput["corrections"] = []): MemoryInput => ({
  evidence, identity: null, corrections, excluded: [], language: "en",
});

describe("A9b shared payload limit", () => {
  it("trims the oldest evidence until the payload fits MEMORY_PAYLOAD_CHAR_LIMIT without over-trimming", () => {
    const evidence = Array.from({ length: 35 }, (_, index) => evidenceOf(index + 1));
    const serialized = memoryPayload(inputOf(evidence));
    const payload = JSON.parse(serialized) as { recipes: { ref: number }[] };
    expect(serialized.length).toBeLessThanOrEqual(MEMORY_PAYLOAD_CHAR_LIMIT);
    expect(payload.recipes.length).toBeLessThan(evidence.length);
    // Each recipe here is about 800 characters, so a correct trim leaves less than one recipe of slack.
    expect(serialized.length).toBeGreaterThan(MEMORY_PAYLOAD_CHAR_LIMIT - 1_000);
    expect(payload.recipes.map(recipe => recipe.ref)).toEqual(payload.recipes.map((_, index) => index + 1));
  });

  it("refuses input whose two minimum sources still exceed MEMORY_PAYLOAD_CHAR_LIMIT", () => {
    const corrections: MemoryInput["corrections"] = [{ key: "techniques", text: "t".repeat(MEMORY_PAYLOAD_CHAR_LIMIT) }];
    expect(() => memoryPayload(inputOf([evidenceOf(1), evidenceOf(2)], corrections))).toThrow("memory_input_limit");
  });
});
