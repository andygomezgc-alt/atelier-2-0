// Deterministic checks of the extraction pipeline output. No AI: each check
// returns readable failures, so the bench can print them.
import { normalizeForMatch, parseIngredient, type ExtractedRecipeResponse } from "@atelier/shared";
import type { MatchCandidate } from "@/lib/products/matching";
import { parseExtractedRecipe } from "@/lib/recipe-extraction";
import { standardizeExtractedRecipe } from "@/lib/recipes/extraction-pipeline";
import type { Expectation } from "./fixtures";

/** A recorded model output through the production validation and pipeline. */
export function runRecorded(raw: unknown, bank: MatchCandidate[]) {
  return standardizeExtractedRecipe(parseExtractedRecipe(raw), bank);
}

const lower = (text: string | null | undefined) => (text ?? "").toLowerCase();

export function checkExtraction(response: ExtractedRecipeResponse, expected: Expectation): string[] {
  const failures: string[] = [];
  const rows = response.recipeIngredients;
  const display = response.contentJson.ingredients;
  if (display.length !== rows.length) {
    failures.push(`contentJson has ${display.length} lines for ${rows.length} ingredients`);
  }

  const sections = [...new Set(rows.flatMap((r) => (r.section ? [lower(r.section)] : [])))];
  const sectionKeys = sections.map(normalizeForMatch).filter(Boolean);
  rows.forEach((row, i) => {
    const label = `#${i + 1} «${display[i] ?? row.rawText}»`;
    // Every line is measured, or its note tells the chef what the measure was.
    const measured = row.qty != null && row.unit != null;
    if (!measured && !row.note) failures.push(`${label}: no measure and no note flagging it`);
    // No preparation inside the product name, as a parenthetical or a suffix.
    const name = parseIngredient(row.rawText).name;
    const nameKey = normalizeForMatch(name);
    if (/[()]/.test(name) || sectionKeys.some((key) => nameKey === key || nameKey.endsWith(` ${key}`))) {
      failures.push(`${label}: section text inside the name «${name}»`);
    }
  });

  const expectedSections = expected.sections.map(lower);
  if (sections.join(" | ") !== expectedSections.join(" | ")) {
    failures.push(`sections [${sections.join(", ")}], expected [${expectedSections.join(", ")}]`);
  }

  if (rows.length !== expected.lines.length) {
    failures.push(`${rows.length} ingredients, expected ${expected.lines.length}`);
  }
  expected.lines.forEach((line, i) => {
    const row = rows[i];
    const label = `#${i + 1} «${line.display}»`;
    if (!row) return;
    if (lower(display[i]) !== lower(line.display)) failures.push(`${label}: got «${display[i]}»`);
    if (lower(row.section) !== lower(line.section)) failures.push(`${label}: section «${row.section}», expected «${line.section}»`);
    if (line.productId !== undefined && row.productId !== line.productId) {
      failures.push(`${label}: product ${row.productId}, expected ${line.productId}`);
    }
    if (line.pesoCalculoG !== undefined && (row.pesoCalculoG ?? null) !== line.pesoCalculoG) {
      failures.push(`${label}: piece weight ${row.pesoCalculoG}, expected ${line.pesoCalculoG}`);
    }
  });

  const pending = response.pendingMatches.map((p) => `${p.ingredientIdx}:${p.productId}`);
  const expectedPending = expected.lines.flatMap((line, i) => (line.pending ? [`${i}:${line.pending}`] : []));
  if (pending.join(" ") !== expectedPending.join(" ")) {
    failures.push(`pending matches [${pending.join(", ")}], expected [${expectedPending.join(", ")}]`);
  }

  const forbidden = new Set(expected.forbiddenProductIds ?? []);
  const offered = [...rows.map((r) => r.productId), ...response.pendingMatches.map((p) => p.productId)];
  for (const id of offered) if (id && forbidden.has(id)) failures.push(`product ${id} must never be linked or offered`);
  return failures;
}
