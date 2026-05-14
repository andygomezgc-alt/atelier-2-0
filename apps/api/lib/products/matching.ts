// Matching fuzzy de ingredientes contra el banco de productos.
//
// Tres niveles según distancia de Levenshtein sobre los strings normalizados:
//
//   distancia 0 → exact:    enlace silencioso (el chef no ve nada).
//   distancia 1-3 → probable: pedimos confirmación al chef vía ConfirmMatchSheet.
//   distancia >3 → none:     ofrecemos crear borrador en el banco.
//
// Normalización: lowercase + sin acentos + colapsar espacios + plurales obvios
// removidos (ej. "trufas" → "trufa") — la función normalizeForMatch ya hace
// las dos primeras y la quitamos de plurales acá si es seguro.
//
// El matching compara el query contra: nombre del producto + todos los
// aliases. La mejor (menor) distancia gana. Empates se rompen por el nombre
// (no aliases) para preferir el producto canónico.

import { normalizeForMatch } from "./defaults";

export type MatchLevel = "exact" | "probable" | "none";

export type MatchCandidate = {
  id: string;
  name: string;
  aliases: string[];
};

export type MatchResult = {
  level: MatchLevel;
  productId: string | null;
  productName: string | null;
  // Distancia Levenshtein contra el mejor candidato (debug + UI: mostrar
  // "match probable: trufa (distancia 1)" si querés).
  distance: number;
};

// Wagner-Fischer DP. O(a*b) tiempo, O(min(a,b)) espacio.
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Swap para que `a` sea siempre el más corto (ahorra memoria).
  if (a.length > b.length) {
    const tmp = a;
    a = b;
    b = tmp;
  }

  // Inicializamos en len+1 — todas las posiciones siempre asignadas, por eso
  // los `!` son seguros (TS no infiere "todo asignado en for-loop").
  const dp: number[] = new Array<number>(a.length + 1);
  for (let i = 0; i <= a.length; i++) dp[i] = i;

  for (let j = 1; j <= b.length; j++) {
    let prev = dp[0]!;
    dp[0] = j;
    for (let i = 1; i <= a.length; i++) {
      const cur = dp[i]!;
      if (a[i - 1] === b[j - 1]) {
        dp[i] = prev;
      } else {
        dp[i] = 1 + Math.min(prev, dp[i]!, dp[i - 1]!);
      }
      prev = cur;
    }
  }

  return dp[a.length]!;
}

// Heurística simple de plurales en castellano/italiano:
// - "trufas" → "trufa" (strip 's' si len > 3)
// - "tomates" → "tomate" (strip 'es' si len > 4)
// No es perfecto (ej. "sales" se reduce a "sal" lo cual es correcto, pero
// "atrás" se reduce a "atrá"). Combinado con Levenshtein el ruido residual
// queda dentro del threshold de 3.
function stripPluralEs(s: string): string {
  if (s.length > 4 && (s.endsWith("es") || s.endsWith("os") || s.endsWith("as"))) {
    return s.slice(0, -2);
  }
  if (s.length > 3 && s.endsWith("s")) {
    return s.slice(0, -1);
  }
  return s;
}

function normalize(s: string): string {
  return stripPluralEs(normalizeForMatch(s));
}

const EXACT_DISTANCE = 0;
const PROBABLE_MAX_DISTANCE = 3;

export function findMatch(
  query: string,
  candidates: ReadonlyArray<MatchCandidate>,
): MatchResult {
  const qNorm = normalize(query);
  if (!qNorm) {
    return { level: "none", productId: null, productName: null, distance: Infinity };
  }

  let bestDistance = Infinity;
  let bestCandidate: MatchCandidate | null = null;
  let bestMatchedOnName = false;

  for (const cand of candidates) {
    // Probamos contra el nombre y cada alias; nos quedamos con la mejor distancia.
    const nameNorm = normalize(cand.name);
    const nameDist = levenshtein(qNorm, nameNorm);
    let candBest = nameDist;
    let candMatchedOnName = true;

    for (const alias of cand.aliases) {
      const aliasDist = levenshtein(qNorm, normalize(alias));
      if (aliasDist < candBest) {
        candBest = aliasDist;
        candMatchedOnName = false;
      }
    }

    // Tie-break: si dos productos empatan en distancia, preferimos el que
    // matcheó por nombre (más confiable que por alias).
    if (
      candBest < bestDistance ||
      (candBest === bestDistance && candMatchedOnName && !bestMatchedOnName)
    ) {
      bestDistance = candBest;
      bestCandidate = cand;
      bestMatchedOnName = candMatchedOnName;
    }
  }

  if (!bestCandidate) {
    return { level: "none", productId: null, productName: null, distance: Infinity };
  }

  let level: MatchLevel;
  if (bestDistance === EXACT_DISTANCE) {
    level = "exact";
  } else if (bestDistance <= PROBABLE_MAX_DISTANCE) {
    level = "probable";
  } else {
    level = "none";
  }

  return {
    level,
    productId: level === "none" ? null : bestCandidate.id,
    productName: level === "none" ? null : bestCandidate.name,
    distance: bestDistance,
  };
}
