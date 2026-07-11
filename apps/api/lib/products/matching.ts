// Matching fuzzy de ingredientes contra el banco de productos.
//
// Tres niveles según distancia de Levenshtein de frase entera + solapamiento
// de tokens significativos:
//
//   distancia 0 → exact:    enlace silencioso (el chef no ve nada).
//   distancia 1-3 → probable: pedimos confirmación al chef vía ConfirmMatchSheet.
//   distancia >3 → none:     ofrecemos crear borrador en el banco.
//
// `probable` también cuando los tokens significativos se solapan ≥ 0.6 (fix
// duplicados ricciola, jul 2026): "lomo de ricciola limpio con piel" reconoce
// a la "Ricciola" del banco y pregunta en vez de duplicar.
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

// ───────── Matching por tokens (fix duplicados tipo "ricciola", jul 2026) ─────────
//
// La distancia de frase entera no ve que "lomo de ricciola limpio con piel"
// habla de la "Ricciola" del banco (distancia enorme → none → duplicado).
// Señal nueva: solapamiento de tokens significativos. Si ≥ 0.6, el match es
// "probable" y el chef confirma en ConfirmMatchSheet (jamás enlazamos solo).

// Artículos/preposiciones es+it + unidades/ruido de cantidades. Se comparan
// DESPUÉS de quitar plural por token ("las"→"la" ya cae como stopword).
const STOPWORDS = new Set([
  // castellano
  "de", "del", "la", "el", "lo", "un", "una", "uno", "y", "o", "u", "con",
  "sin", "al", "a", "en", "para", "por", "su", "sobre", "mas", "muy",
  // italiano
  "di", "da", "della", "dello", "dei", "degli", "delle", "il", "gli", "le",
  "i", "e", "ed", "ad", "in", "per", "senza", "sul", "sulla", "piu",
  // unidades / ruido de cantidad que sobrevive al parser dentro de paréntesis
  "aprox", "approx", "circa", "ca", "neto", "netto", "g", "gr", "kg", "ml",
  "cl", "l", "lt", "ud", "uds", "unidad", "unidades", "pz", "pezzo", "pezzi",
]);

const FUZZY_TOKEN_MIN_LEN = 5;
const TOKEN_OVERLAP_THRESHOLD = 0.6;

// Exportada para tests. Tokens únicos, normalizados, sin plural, sin
// stopwords, sin números puros, sin tokens de 1 char.
export function tokenizeForMatch(s: string): string[] {
  const out = new Set<string>();
  for (const raw of normalizeForMatch(s).split(/[^a-z0-9]+/)) {
    if (raw.length < 2 || /^\d+$/.test(raw)) continue;
    if (STOPWORDS.has(raw)) continue;
    const tok = stripPluralEs(raw);
    if (tok.length < 2 || STOPWORDS.has(tok)) continue;
    out.add(tok);
  }
  return [...out];
}

// Dos tokens "hablan de lo mismo": idénticos, o a 1 edición si ambos son
// largos (frollata≈frollada). Cortos exactos ("piel" jamás ≈ "miel").
function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < FUZZY_TOKEN_MIN_LEN || b.length < FUZZY_TOKEN_MIN_LEN) return false;
  return levenshtein(a, b) <= 1;
}

// Coeficiente de overlap: qué fracción del conjunto CHICO encuentra pareja
// en el grande. Robusto cuando un lado es "Ricciola" y el otro una frase.
function tokenOverlap(aTokens: string[], bTokens: string[]): number {
  if (aTokens.length === 0 || bTokens.length === 0) return 0;
  const [small, large] =
    aTokens.length <= bTokens.length ? [aTokens, bTokens] : [bTokens, aTokens];
  let matched = 0;
  for (const t of small) {
    if (large.some((u) => tokensMatch(t, u))) matched++;
  }
  return matched / small.length;
}

export function findMatch(
  query: string,
  candidates: ReadonlyArray<MatchCandidate>,
): MatchResult {
  const qNorm = normalize(query);
  if (!qNorm) {
    return { level: "none", productId: null, productName: null, distance: Infinity };
  }
  const qTokens = tokenizeForMatch(query);

  let best: {
    candidate: MatchCandidate;
    level: MatchLevel;
    distance: number;
    overlap: number;
    matchedOnName: boolean;
  } | null = null;

  const levelRank: Record<MatchLevel, number> = { exact: 2, probable: 1, none: 0 };

  for (const cand of candidates) {
    // Distancia de frase entera (comportamiento histórico) y overlap de
    // tokens, ambos contra nombre + aliases; nos quedamos con lo mejor.
    const nameNorm = normalize(cand.name);
    let candDist = levenshtein(qNorm, nameNorm);
    let candMatchedOnName = true;
    let candOverlap = tokenOverlap(qTokens, tokenizeForMatch(cand.name));

    for (const alias of cand.aliases) {
      const aliasDist = levenshtein(qNorm, normalize(alias));
      if (aliasDist < candDist) {
        candDist = aliasDist;
        candMatchedOnName = false;
      }
      const aliasOverlap = tokenOverlap(qTokens, tokenizeForMatch(alias));
      if (aliasOverlap > candOverlap) candOverlap = aliasOverlap;
    }

    let level: MatchLevel;
    if (candDist === EXACT_DISTANCE) {
      level = "exact";
    } else if (candDist <= PROBABLE_MAX_DISTANCE || candOverlap >= TOKEN_OVERLAP_THRESHOLD) {
      level = "probable";
    } else {
      level = "none";
    }

    // Mejor candidato: nivel > overlap > distancia > matcheó-por-nombre.
    if (
      !best ||
      levelRank[level] > levelRank[best.level] ||
      (levelRank[level] === levelRank[best.level] &&
        (candOverlap > best.overlap ||
          (candOverlap === best.overlap &&
            (candDist < best.distance ||
              (candDist === best.distance && candMatchedOnName && !best.matchedOnName)))))
    ) {
      best = {
        candidate: cand,
        level,
        distance: candDist,
        overlap: candOverlap,
        matchedOnName: candMatchedOnName,
      };
    }
  }

  if (!best || best.level === "none") {
    return {
      level: "none",
      productId: null,
      productName: null,
      distance: best ? best.distance : Infinity,
    };
  }

  return {
    level: best.level,
    productId: best.candidate.id,
    productName: best.candidate.name,
    distance: best.distance,
  };
}
