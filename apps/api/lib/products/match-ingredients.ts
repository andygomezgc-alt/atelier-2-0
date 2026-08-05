// Matching de una lista de ingredientes contra el banco.
//
// Este bloque estaba copiado palabra por palabra en las tres rutas que
// producen un borrador de receta (recipes/upload, recipes/extract,
// recipes/import-gdoc). Al agregar el nivel "ambiguo" había que tocar las
// tres igual, así que vive acá una sola vez.
//
// Los tres desenlaces por ingrediente:
//   exact    → productId pre-cargado, el chef no ve nada.
//   probable → pendingMatches; el cliente pregunta sí/no (ConfirmMatchSheet).
//   ambiguo  → ambiguousMatches; el banco tiene varios hermanos de familia y
//              el chef elige cuál (PickVariantSheet). NUNCA se adivina.
//   none     → productId null; al guardar se crea un borrador en el banco.

import { findMatch, type MatchCandidate, type AmbiguousCandidate } from "./matching";
import { parseIngredient } from "./parser";

export type PendingMatch = {
  ingredientIdx: number;
  productId: string;
  productName: string;
};

export type AmbiguousMatch = {
  ingredientIdx: number;
  candidates: AmbiguousCandidate[];
};

export type MatchedIngredients = {
  recipeIngredients: Array<{ rawText: string; productId: string | null }>;
  pendingMatches: PendingMatch[];
  ambiguousMatches: AmbiguousMatch[];
};

export function matchIngredientList(
  rawTexts: readonly string[],
  candidates: ReadonlyArray<MatchCandidate>,
): MatchedIngredients {
  const recipeIngredients: MatchedIngredients["recipeIngredients"] = [];
  const pendingMatches: PendingMatch[] = [];
  const ambiguousMatches: AmbiguousMatch[] = [];

  rawTexts.forEach((rawText, idx) => {
    // Bug C fix (Andy 2026-05-17): parsear antes de matchear. El LLM extrae
    // líneas tipo "200g harina"; pasadas enteras a findMatch, Levenshtein
    // contra "harina" da distance>3 y cae como "none" → draft duplicado.
    const parsed = parseIngredient(rawText);
    const m = findMatch(parsed.name || rawText, candidates);

    if (m.level === "exact" && m.productId) {
      recipeIngredients.push({ rawText, productId: m.productId });
      return;
    }

    // Sin productId en los tres casos restantes: un ingrediente ambiguo NO
    // se guarda enlazado a una variante adivinada.
    recipeIngredients.push({ rawText, productId: null });

    if (m.level === "probable" && m.productId && m.productName) {
      pendingMatches.push({
        ingredientIdx: idx,
        productId: m.productId,
        productName: m.productName,
      });
    } else if (m.level === "ambiguo" && m.candidates.length > 0) {
      ambiguousMatches.push({ ingredientIdx: idx, candidates: m.candidates });
    }
  });

  return { recipeIngredients, pendingMatches, ambiguousMatches };
}

// Select de Prisma que alimenta a MatchCandidate. precioCompra/unidadCompra
// son para el sheet de elección: sin precio a la vista, elegir entre cuatro
// gamberi es una lotería.
export const MATCH_CANDIDATE_SELECT = {
  id: true,
  name: true,
  aliases: true,
  precioCompra: true,
  unidadCompra: true,
} as const;
