// apps/api/lib/invoices/line-matching.ts
// Connects invoice lines to bank products (spec approach C): supplier memory first, then the
// bank rules, then one AI call for the lines the rules leave in doubt. Families with several
// siblings (ambiguo) are the chef's call, never the AI's.
import { findMatch, tokenizeForMatch, type MatchCandidate } from "../products/matching";
import { logger } from "../logger";
import type { ExtractedInvoiceLine } from "./extraction";

function fold(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// Legal forms after folding ("S.p.A." -> "s p a"), so one supplier printed two ways is one supplier.
const LEGAL_FORMS = /\b(?:s ?r ?l ?s?|s ?p ?a|s ?a ?s|s ?n ?c|s ?l ?u|s ?l|s ?a|ltd|limited|gmbh|inc|llc|b ?v|sarl)\b/g;

export function normalizeSupplierName(name: string): string {
  return fold(name.replace(/\([^)]*\)/g, " ")).replace(LEGAL_FORMS, " ").replace(/\s+/g, " ").trim();
}

export function normalizeDescription(text: string): string {
  return fold(text);
}

export function normalizeCode(code: string | null): string | null {
  const value = code?.replace(/\s+/g, "").toUpperCase() ?? "";
  return value === "" ? null : value;
}

export type SupplierMemoryEntry = { code: string | null; descriptionNorm: string; productId: string; packQty: number | null; packUnit: string | null };
export type LineMatchLevel = "memory" | "exact" | "ai" | "probable" | "ambiguo" | "none" | "charge";
export type LineMatch = { productId: string | null; level: LineMatchLevel; packQty: number | null; packUnit: string | null };
export type SecondLookRequest = { position: number; description: string; candidates: Array<{ id: string; name: string }> };
export type SecondLook = (requests: SecondLookRequest[]) => Promise<Map<number, string | null>>;

const SECOND_LOOK_CANDIDATES = 5;

export function topCandidates(query: string, candidates: ReadonlyArray<MatchCandidate>, limit = SECOND_LOOK_CANDIDATES): MatchCandidate[] {
  const q = new Set(tokenizeForMatch(query));
  if (q.size === 0) return [];
  const score = (text: string) => {
    const t = new Set(tokenizeForMatch(text));
    let shared = 0;
    for (const word of t) if (q.has(word)) shared++;
    return shared === 0 ? 0 : shared / (q.size + t.size - shared);
  };
  return candidates
    .map((c) => ({ c, s: Math.max(score(c.name), ...c.aliases.map(score)) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.c.name.length - b.c.name.length)
    .slice(0, limit)
    .map((x) => x.c);
}

export async function matchInvoiceLines(input: {
  lines: ReadonlyArray<Pick<ExtractedInvoiceLine, "description" | "code" | "packQty" | "packUnit" | "kind">>;
  memory: ReadonlyArray<SupplierMemoryEntry>;
  candidates: ReadonlyArray<MatchCandidate>;
  secondLook: SecondLook;
}): Promise<LineMatch[]> {
  const byCode = new Map(input.memory.flatMap((m) => (m.code ? [[m.code, m] as const] : [])));
  const byDescription = new Map(input.memory.map((m) => [m.descriptionNorm, m] as const));
  const results: LineMatch[] = [];
  const doubtful: SecondLookRequest[] = [];

  input.lines.forEach((line, position) => {
    const ownPack = { packQty: line.packQty, packUnit: line.packUnit };
    if (line.kind === "charge") {
      results.push({ productId: null, level: "charge", ...ownPack });
      return;
    }
    const code = normalizeCode(line.code);
    const remembered = (code ? byCode.get(code) : undefined) ?? byDescription.get(normalizeDescription(line.description));
    if (remembered) {
      const pack = line.packQty !== null ? ownPack : { packQty: remembered.packQty, packUnit: remembered.packUnit };
      results.push({ productId: remembered.productId, level: "memory", ...pack });
      return;
    }
    const match = findMatch(line.description, input.candidates);
    if (match.level === "exact" || match.level === "ambiguo") {
      results.push({ productId: match.level === "exact" ? match.productId : null, level: match.level, ...ownPack });
      return;
    }
    results.push({ productId: match.level === "probable" ? match.productId : null, level: match.level, ...ownPack });
    const top = topCandidates(line.description, input.candidates);
    const suggested = match.productId ? input.candidates.find((c) => c.id === match.productId) : undefined;
    if (suggested && !top.some((c) => c.id === suggested.id)) top.unshift(suggested);
    if (top.length > 0) {
      doubtful.push({ position, description: line.description, candidates: top.slice(0, SECOND_LOOK_CANDIDATES).map((c) => ({ id: c.id, name: c.name })) });
    }
  });

  if (doubtful.length === 0) return results;
  let answers = new Map<number, string | null>();
  try {
    answers = await input.secondLook(doubtful);
  } catch (error) {
    // The second look only improves matches: without it the chef still reviews every doubtful line.
    logger.warn("invoice_second_look_failed", { lines: doubtful.length, message: error instanceof Error ? error.message : String(error) });
  }
  for (const request of doubtful) {
    const picked = answers.get(request.position);
    if (picked && request.candidates.some((c) => c.id === picked)) {
      results[request.position] = { ...results[request.position]!, productId: picked, level: "ai" };
    }
  }
  return results;
}
