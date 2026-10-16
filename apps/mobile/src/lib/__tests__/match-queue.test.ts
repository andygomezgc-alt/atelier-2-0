import { describe, expect, it } from "vitest";
import type { MatchResult } from "@atelier/shared";
import { classifyMatches } from "@/src/lib/match-queue";

const base = { productId: null, productName: null, distance: 0, candidates: [] };
const sibling = (id: string) => ({ id, name: id, origen: null, calibreLabel: null, precioCompra: null, unidadCompra: null });

describe("classifyMatches", () => {
  it("links exact, queues probable and ambiguous, drafts the rest", () => {
    const results: MatchResult[] = [
      { ...base, level: "exact", productId: "p1", productName: "Limón" },
      { ...base, level: "probable", productId: "p2", productName: "Ajo" },
      { ...base, level: "ambiguo", candidates: [sibling("g1"), sibling("g2")] },
      { ...base, level: "none" },
    ];
    const out = classifyMatches(results, [0, 3, 5, 6], ["limon", "ajos", "gambero rosso", "yuzu"]);
    expect(out.linked).toEqual([{ ingredientIdx: 0, productId: "p1" }]);
    expect(out.queue).toEqual([
      { kind: "confirm", ingredientIdx: 3, rawText: "ajos", productId: "p2", productName: "Ajo" },
      { kind: "pick", ingredientIdx: 5, rawText: "gambero rosso", candidates: [sibling("g1"), sibling("g2")] },
    ]);
    expect(out.drafts).toEqual([6]);
  });

  it("an ambiguous result with no candidates becomes a draft, never a crash", () => {
    const out = classifyMatches([{ ...base, level: "ambiguo" }], [2], ["x"]);
    expect(out.queue).toEqual([]);
    expect(out.drafts).toEqual([2]);
  });
});
