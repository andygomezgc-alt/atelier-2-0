// The one pipeline after every recipe extraction (/api/recipes/extract,
// /upload and /import-gdoc): each ingredient goes through the standard
// format, is matched against the bank on its clean name only and comes back
// in the ExtractedRecipeResponse shape the review form already reads.

import { prisma } from "@atelier/db";
import {
  displayLine,
  formatIngredientLine,
  normalizeForMatch,
  standardizeIngredient,
  standardizeIngredientLines,
  type ExtractedRecipeIngredient,
  type ExtractedRecipeResponse,
  type StandardIngredient,
  type StandardizeFlag,
} from "@atelier/shared";
import { findMatch, type MatchCandidate } from "@/lib/products/matching";
import type { ExtractedRecipe } from "@/lib/recipe-extraction";

// RecipeContentSchema accepts contentJson lines of up to 500 characters.
const CONTENT_LINE_MAX = 500;

/** Counts for logging: lines without a measure and what the normalizer flagged. */
export type ExtractionStats = {
  ingredients: number;
  unmeasured: number;
  household: number;
  range: number;
  fraction: number;
  note_split: number;
  section: number;
};

type Standardized = { ingredient: StandardIngredient; flags: readonly StandardizeFlag[] };

/** The restaurant's active and draft products, for matching. */
export async function loadMatchCandidates(restaurantId: string | null | undefined): Promise<MatchCandidate[]> {
  if (!restaurantId) return [];
  const products = await prisma.product.findMany({
    where: { restaurantId, deletedAt: null, estado: { in: ["activo", "borrador"] } },
    select: { id: true, name: true, aliases: true },
  });
  return products.map((p) => ({ id: p.id, name: p.name, aliases: p.aliases }));
}

const TRAILING_PAREN = /\(([^()]+)\)[\s.,;:]*$/;

/**
 * GLM used to flatten each preparation into a suffix on every line:
 * "40 g AOVE (aceite de chorizo)". The trailing parentheticals are section
 * labels when at least 60% of the lines have one, there are two or more
 * labels, each label is one contiguous block, and most of those lines sit in
 * blocks of two or more. Kitchen notes such as "(tamizada)" do not repeat.
 */
function flattenedSections(texts: readonly string[]): string[] {
  const labels = texts.flatMap((text) => {
    const m = TRAILING_PAREN.exec(text.trim());
    return m ? [{ key: normalizeForMatch(m[1]!), text: m[1]!.trim() }] : [];
  });
  if (labels.length < 2 || labels.length * 5 < texts.length * 3) return [];

  const blocks: Array<{ key: string; text: string; size: number }> = [];
  for (const label of labels) {
    const last = blocks.at(-1);
    if (last?.key === label.key) last.size++;
    else blocks.push({ ...label, size: 1 });
  }
  const distinct = new Set(blocks.map((b) => b.key));
  const inRepeatedBlocks = blocks.filter((b) => b.size >= 2).reduce((sum, b) => sum + b.size, 0);
  if (distinct.size < 2 || distinct.size !== blocks.length || inRepeatedBlocks * 2 <= labels.length) return [];
  return blocks.map((b) => b.text);
}

// standardizeIngredientLines returns the union of the flags; a one-line call
// gives each line its own (header and blank lines give no ingredient).
function standardizeLines(lines: readonly string[], knownSections: readonly string[]): Standardized[] {
  const { ingredients } = standardizeIngredientLines(lines, { knownSections });
  const flags = lines.flatMap((line) => {
    const one = standardizeIngredientLines([line], { knownSections });
    return one.ingredients.length > 0 ? [one.flags] : [];
  });
  return ingredients.map((ingredient, i) => ({ ingredient, flags: flags[i] ?? [] }));
}

function standardizeAll(items: ExtractedRecipe["ingredients"]): Standardized[] {
  const texts = items.map((item) => (typeof item === "string" ? item : item.name ?? ""));
  const objectSections = items.flatMap((item) => (typeof item !== "string" && item.section?.trim() ? [item.section.trim()] : []));
  const knownSections = [...new Set([...objectSections, ...flattenedSections(texts)])];

  // Consecutive lines go through the list normalizer together, so a bold or
  // "X:" header line becomes the section of the lines below it.
  const out: Standardized[] = [];
  let lines: string[] = [];
  const flush = () => {
    if (lines.length > 0) out.push(...standardizeLines(lines, knownSections));
    lines = [];
  };
  for (const item of items) {
    if (typeof item === "string") {
      lines.push(item);
      continue;
    }
    flush();
    const result = standardizeIngredient(item, { knownSections });
    if (result.ingredient.name) out.push(result);
  }
  flush();
  return out;
}

function countStats(rows: readonly Standardized[]): ExtractionStats {
  const flagged = (flag: StandardizeFlag) => rows.filter((r) => r.flags.includes(flag)).length;
  return {
    ingredients: rows.length,
    unmeasured: rows.filter((r) => r.ingredient.qty === null).length,
    household: flagged("household"),
    range: flagged("range"),
    fraction: flagged("fraction"),
    note_split: flagged("note_split"),
    section: rows.filter((r) => r.ingredient.section !== null).length,
  };
}

/**
 * Standard-format response for an extracted recipe.
 *   - recipeIngredients: canonical rawText, the bank product when the match is
 *     exact, and the structured fields (qty, unit, section, note, piece weight).
 *   - contentJson.ingredients: the display lines, one per recipeIngredient,
 *     for app builds that only read contentJson.
 *   - pendingMatches: probable matches; ingredientIdx is the position in
 *     recipeIngredients.
 */
export function standardizeExtractedRecipe(
  extracted: ExtractedRecipe,
  candidates: readonly MatchCandidate[],
): { response: ExtractedRecipeResponse; stats: ExtractionStats } {
  const rows = standardizeAll(extracted.ingredients);
  const recipeIngredients: ExtractedRecipeIngredient[] = [];
  const pendingMatches: ExtractedRecipeResponse["pendingMatches"] = [];

  rows.forEach(({ ingredient }, idx) => {
    // Notes and sections never reach the matcher.
    const match = findMatch(ingredient.name, candidates);
    recipeIngredients.push({
      rawText: formatIngredientLine(ingredient),
      productId: match.level === "exact" && match.productId ? match.productId : null,
      qty: ingredient.qty,
      unit: ingredient.unit,
      section: ingredient.section,
      note: ingredient.note,
      // A piece weight only means something for pieces.
      pesoCalculoG: ingredient.unit === "unidad" ? ingredient.pieceWeightG : null,
    });
    if (match.level === "probable" && match.productId && match.productName) {
      pendingMatches.push({ ingredientIdx: idx, productId: match.productId, productName: match.productName });
    }
  });

  return {
    response: {
      title: extracted.title,
      portions: extracted.portions ?? null,
      contentJson: {
        ingredients: rows.map(({ ingredient }) => displayLine(ingredient).slice(0, CONTENT_LINE_MAX)),
        method: extracted.method,
        notes: extracted.notes ?? "",
      },
      recipeIngredients,
      pendingMatches,
    },
    stats: countStats(rows),
  };
}
