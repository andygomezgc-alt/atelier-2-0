import type { Prisma } from "@atelier/db";
import {
  detectPezzaturaFromName,
  formatIngredientLine,
  normalizeForMatch,
  standardizeIngredientLine,
  type RecipeIngredientInput,
} from "@atelier/shared";
import { categorizeFromName, defaultMermaPct } from "./defaults";
import { defaultPurchaseUnit } from "./purchase-unit";
import { defaultCriticality } from "./criticality";
import { findMatch } from "./matching";

export class RecipeSaveError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}

// One short transaction lock for every path that creates ingredient drafts.
// Separate API workers therefore cannot create the same automatic draft concurrently.
export async function lockRecipeSave(tx: Prisma.TransactionClient, restaurantId: string) {
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`recipe-save:${restaurantId}`}))`;
}

/** A row already stored for the recipe (PATCH only): the source of inherited section and note. */
export type StoredIngredientLine = { position: number; rawText: string; section: string | null; note: string | null };

const CONTENT_LINE_MAX = 500;
const blankToNull = (value: string | null | undefined) => value?.trim() || null;

/**
 * contentJson.ingredients for the saved rows: rawText plus ", " + note (the
 * shared displayLine), so app builds that only read contentJson still show a
 * flat, clean list. Capped at the 500 characters RecipeContentSchema accepts.
 */
export function ingredientDisplayLines(rows: ReadonlyArray<{ rawText: string; note: string | null }>): string[] {
  return rows.map((row) => (row.note ? `${row.rawText}, ${row.note}` : row.rawText).slice(0, CONTENT_LINE_MAX));
}

/**
 * The server is the only canonicalizer: every line goes through the standard
 * format before it is matched, drafted or stored.
 *   - rawText/qty/unit come from the standard line, unless the client sent an
 *     explicit qty/unit that contradicts it: then the client's rawText, qty and
 *     unit are kept as they are.
 *   - note: the note split from the text; else the client's note (null
 *     included); else the stored line's.
 *   - section: the client's section (null included); else a parenthetical that
 *     names a known section; else the stored line's.
 *   - The stored line is the one at the same position with the same clean name,
 *     so older app builds that drop section/note do not erase them.
 *   - pesoCalculoG: the client's value when set; else the piece weight in the text.
 */
export async function resolveIngredientDrafts(
  tx: Prisma.TransactionClient,
  restaurantId: string,
  ingredients: RecipeIngredientInput[],
  stored: readonly StoredIngredientLine[] = [],
) {
  const ids = [...new Set(ingredients.flatMap(i => i.productId ? [i.productId] : []))];
  if (ids.length && await tx.product.count({ where: { id: { in: ids }, restaurantId, deletedAt: null } }) !== ids.length) {
    throw new RecipeSaveError("invalid_product_reference");
  }
  const candidates = ingredients.some(i => !i.productId && i.createProductDraft)
    ? await tx.product.findMany({ where: { restaurantId, deletedAt: null, estado: { in: ["activo", "borrador"] } }, select: { id: true, name: true, aliases: true } }) : [];
  const knownSections = [...new Set([...ingredients.map(i => blankToNull(i.section)), ...stored.map(s => s.section)]
    .filter((s): s is string => !!s))];
  const storedAt = new Map(stored.map(s => [s.position, s] as const));
  const rows = [];
  for (const [position, ing] of ingredients.entries()) {
    const ownSection = ing.section === undefined ? undefined : blankToNull(ing.section);
    // A row that states its section only reads a parenthetical as that same section.
    const std = standardizeIngredientLine(ing.rawText, {
      knownSections: ownSection === undefined ? knownSections : ownSection ? [ownSection] : [],
    }).ingredient;
    const prior = storedAt.get(position);
    const inherited = prior && normalizeForMatch(standardizeIngredientLine(prior.rawText).ingredient.name) === normalizeForMatch(std.name)
      ? prior : null;

    const qty = ing.qty !== undefined ? ing.qty : std.qty;
    const unit = ing.unit !== undefined ? ing.unit : std.unit;
    const explicit = unit !== std.unit || (qty === null ? std.qty !== null : std.qty === null || Math.abs(qty - std.qty) > 1e-9);
    const textNote = explicit ? null : std.note;
    const note = textNote ?? (ing.note !== undefined ? blankToNull(ing.note) : inherited?.note ?? null);
    const section = ownSection !== undefined ? ownSection : std.section ?? inherited?.section ?? null;

    let productId = ing.productId ?? null;
    if (!productId && ing.createProductDraft) {
      // Match and draft on the clean product name only: notes and sections never reach it.
      const name = std.name || ing.rawText.trim();
      const match = findMatch(name, candidates);
      if (match.level === "exact" && match.productId) productId = match.productId;
      else {
        const category = categorizeFromName(name);
        const pezzatura = detectPezzaturaFromName(name, category);
        const created = await tx.product.create({ data: {
          restaurantId, name, category, unidadCompra: defaultPurchaseUnit(category, name), precioCompra: 0,
          mermaPct: defaultMermaPct(category), mermaOrigen: "sugerida", estado: "borrador",
          criticality: defaultCriticality(category, name), criticalityManual: false,
          pezzaturaMode: pezzatura?.mode ?? null, pezzaturaMin: pezzatura?.min ?? null, pezzaturaMax: pezzatura?.max ?? null,
        } });
        productId = created.id;
        candidates.push({ id: created.id, name: created.name, aliases: created.aliases });
      }
    }
    rows.push({ productId, position, rawText: explicit ? ing.rawText : formatIngredientLine(std), qty, unit,
      pezzatura: ing.pezzatura ?? null, mermaOverridePct: ing.mermaOverridePct ?? null,
      pesoCalculoG: ing.pesoCalculoG ?? std.pieceWeightG ?? null, section, note });
  }
  return rows;
}
