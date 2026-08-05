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
import {
  splitAttributes,
  attributesMatch,
  baseNameMatches,
  hasDiscriminators,
  type ProductAttributes,
} from "@atelier/shared";

// "ambiguo" (jul 2026, pedido de Andy): el banco tiene varios productos de la
// MISMA familia (Gambero rosso Mazara 3ra / Sicilia 15/20 / Argentina 20/30) y
// la receta dice solo "gambero rosso". El sistema NO elige: devuelve los
// hermanos y el chef marca cuál. Ver ambiguityFor() más abajo.
export type MatchLevel = "exact" | "ambiguo" | "probable" | "none";

export type MatchCandidate = {
  id: string;
  name: string;
  aliases: string[];
  // Opcionales: solo los usa el sheet de elección entre hermanos. Los
  // llamadores que no desambiguan (migrate.ts) pueden omitirlos.
  precioCompra?: number;
  unidadCompra?: string;
};

// Hermano de familia que el chef tiene que distinguir. origen/calibre salen
// del propio nombre del producto; el precio viene del banco. Los tres juntos
// son lo que hace que elegir sea una decisión informada y no una lotería.
export type AmbiguousCandidate = {
  id: string;
  name: string;
  origen: string | null;
  calibreLabel: string | null;
  precioCompra: number | null;
  unidadCompra: string | null;
};

export type MatchResult = {
  level: MatchLevel;
  productId: string | null;
  productName: string | null;
  // Distancia Levenshtein contra el mejor candidato (debug + UI: mostrar
  // "match probable: trufa (distancia 1)" si querés).
  distance: number;
  // Solo con level="ambiguo": los hermanos entre los que hay que elegir.
  // Vacío en todos los demás niveles.
  candidates: AmbiguousCandidate[];
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

// ───────── Desambiguación entre hermanos de familia (jul 2026) ─────────
//
// Los atributos salen del NOMBRE del producto, no de columnas: así funciona
// hoy mismo, sin esperar a que la migración llene Product.baseName. Cuando
// esas columnas existan, esto se puede cambiar por una lectura directa.
//
// splitAttributes es regex-pesada y /api/products/match la llamaría
// queries × candidatos veces (50 × 500 = 25.000). Memo por nombre: los
// nombres del banco se repiten en cada query del mismo request.
const attrCache = new Map<string, ProductAttributes>();
const ATTR_CACHE_MAX = 4000;

function attrsOf(name: string): ProductAttributes {
  const hit = attrCache.get(name);
  if (hit) return hit;
  const attrs = splitAttributes(name);
  // Cache sin política de expulsión fina: al llenarse se vacía entera. Es un
  // acelerador, no una fuente de verdad, y el costo de recalcular es bajo.
  if (attrCache.size >= ATTR_CACHE_MAX) attrCache.clear();
  attrCache.set(name, attrs);
  return attrs;
}

function toAmbiguous(c: MatchCandidate): AmbiguousCandidate {
  const a = attrsOf(c.name);
  return {
    id: c.id,
    name: c.name,
    origen: a.origen,
    calibreLabel: a.calibreLabel,
    precioCompra: c.precioCompra ?? null,
    unidadCompra: c.unidadCompra ?? null,
  };
}

// Cuántos atributos que el query SÍ nombra coinciden exactamente con los del
// candidato. Es distinto de attributesMatch, que solo comprueba que no haya
// choque: un producto sin calibre cargado "no contradice" a un query 15/20,
// pero tampoco lo confirma. Sin esta distinción, un hermano con los datos
// incompletos se cuela en toda elección y el chef termina eligiendo siempre.
function positiveMatches(
  q: ProductAttributes,
  c: ProductAttributes,
): number {
  let n = 0;
  if (q.origen !== null && q.origen === c.origen) n++;
  if (q.calibreLabel !== null && q.calibreLabel === c.calibreLabel) n++;
  if (q.conservacion !== null && q.conservacion === c.conservacion) n++;
  return n;
}

type FamilyVerdict =
  // Sin familia que desambiguar — comportamiento histórico intacto.
  | { kind: "pass" }
  // Los atributos del query señalan a un hermano concreto.
  | { kind: "pin"; candidate: MatchCandidate }
  // Hay que preguntarle al chef.
  | { kind: "ambiguous"; options: MatchCandidate[] };

// Solo se activa cuando el ganador tiene AL MENOS UN hermano de familia: si
// el producto es único en su familia, nada cambia respecto de siempre. Ese
// guard es lo que mantiene intacto el comportamiento de las recetas actuales.
function resolveFamily(
  query: string,
  winner: MatchCandidate,
  candidates: ReadonlyArray<MatchCandidate>,
): FamilyVerdict {
  const qAttrs = splitAttributes(query);
  if (!qAttrs.baseName) return { kind: "pass" };

  // El ganador tiene que ser de la familia del query; si ganó por otra vía
  // (frase larga, alias), no hay familia que desambiguar.
  if (!baseNameMatches(qAttrs.baseName, attrsOf(winner.name).baseName))
    return { kind: "pass" };

  const family = candidates.filter((c) =>
    baseNameMatches(qAttrs.baseName, attrsOf(c.name).baseName),
  );
  if (family.length < 2) return { kind: "pass" };

  // De los hermanos, los que no contradicen lo que dice el query.
  const compatible = family.filter((c) =>
    attributesMatch(qAttrs, attrsOf(c.name)),
  );

  // ¿Alguno coincide POSITIVAMENTE mejor que todos los demás? Si el query
  // trae "15/20" y un solo hermano lo tiene, ese es — aunque otro hermano
  // sin calibre cargado tampoco lo contradiga.
  if (hasDiscriminators(qAttrs) && compatible.length > 0) {
    const scored = compatible.map((c) => ({
      c,
      score: positiveMatches(qAttrs, attrsOf(c.name)),
    }));
    const top = Math.max(...scored.map((s) => s.score));
    const winners = scored.filter((s) => s.score === top);
    if (top > 0 && winners.length === 1) {
      return { kind: "pin", candidate: winners[0]!.c };
    }
  }

  // Cualquier otro caso se pregunta. Si ninguno es compatible (el chef pidió
  // una procedencia que el banco no tiene) igual se ofrecen todos: el sheet
  // tiene la salida "ninguna, crear nuevo".
  return { kind: "ambiguous", options: compatible.length > 0 ? compatible : family };
}

export function findMatch(
  query: string,
  candidates: ReadonlyArray<MatchCandidate>,
): MatchResult {
  const qNorm = normalize(query);
  if (!qNorm) {
    return {
      level: "none",
      productId: null,
      productName: null,
      distance: Infinity,
      candidates: [],
    };
  }
  const qTokens = tokenizeForMatch(query);

  let best: {
    candidate: MatchCandidate;
    level: MatchLevel;
    distance: number;
    overlap: number;
    matchedOnName: boolean;
  } | null = null;

  // "ambiguo" no sale nunca de este bucle (se decide después, mirando la
  // familia entera); está en el mapa solo para que el Record quede completo.
  const levelRank: Record<MatchLevel, number> = {
    exact: 3,
    ambiguo: 2,
    probable: 1,
    none: 0,
  };

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
      candidates: [],
    };
  }

  // Antes de devolver el ganador: ¿hay hermanos de familia que el query no
  // distingue? Si los hay, no se enlaza nada y decide el chef. Esto pisa
  // incluso a "exact" — un nombre que coincide letra por letra tampoco
  // alcanza si en el banco hay cuatro gamberi rossi.
  const family = resolveFamily(query, best.candidate, candidates);
  if (family.kind === "ambiguous") {
    return {
      level: "ambiguo",
      productId: null,
      productName: null,
      distance: best.distance,
      candidates: family.options.map(toAmbiguous),
    };
  }
  if (family.kind === "pin") {
    // Los atributos identifican el producto sin lugar a duda; es una señal
    // más fuerte que la distancia de texto, así que vale como exact y no
    // se le pregunta nada al chef.
    return {
      level: "exact",
      productId: family.candidate.id,
      productName: family.candidate.name,
      distance: levenshtein(qNorm, normalize(family.candidate.name)),
      candidates: [],
    };
  }

  return {
    level: best.level,
    productId: best.candidate.id,
    productName: best.candidate.name,
    distance: best.distance,
    candidates: [],
  };
}
