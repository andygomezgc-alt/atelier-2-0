// Splits the bank-match results of a recipe's unlinked ingredients into what
// links silently, what the chef must confirm or pick, and what becomes a draft.
import type { AmbiguousCandidate, MatchResult } from "@atelier/shared";

export type QueuedMatch =
  | { kind: "confirm"; ingredientIdx: number; rawText: string; productId: string; productName: string }
  | { kind: "pick"; ingredientIdx: number; rawText: string; candidates: AmbiguousCandidate[] };

export function classifyMatches(
  results: MatchResult[],
  ingredientIdxs: number[],
  rawTexts: string[],
): { linked: Array<{ ingredientIdx: number; productId: string }>; queue: QueuedMatch[]; drafts: number[] } {
  const linked: Array<{ ingredientIdx: number; productId: string }> = [];
  const queue: QueuedMatch[] = [];
  const drafts: number[] = [];
  results.forEach((r, i) => {
    const ingredientIdx = ingredientIdxs[i]!;
    const rawText = rawTexts[i]!;
    if (r.level === "exact" && r.productId) {
      linked.push({ ingredientIdx, productId: r.productId });
    } else if (r.level === "probable" && r.productId && r.productName) {
      queue.push({ kind: "confirm", ingredientIdx, rawText, productId: r.productId, productName: r.productName });
    } else if (r.level === "ambiguo" && r.candidates.length > 0) {
      queue.push({ kind: "pick", ingredientIdx, rawText, candidates: r.candidates });
    } else {
      drafts.push(ingredientIdx);
    }
  });
  return { linked, queue, drafts };
}
