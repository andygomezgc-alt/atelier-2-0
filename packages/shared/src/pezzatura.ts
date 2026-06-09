// Entrega A.5 — Parser y auto-detección de pezzatura.
//
// El "calibre" (pezzatura) de un producto se almacena en formato estructurado
// (PezzaturaMode + min + max canónicos). Este módulo expone:
//
//   1. resolvePezzaturaMode  — qué modo aplica según categoría + nombre.
//   2. detectPezzaturaFromName — extrae pezzatura embebida en el nombre
//                                  ("Gamberi 15/20" → pz_per_kg 15/20).
//   3. parsePezzatura — parsea texto libre del input del chef.
//   4. formatPezzatura — render canónico para mostrar.
//
// No toca DB ni endpoints. Integración con POST/PATCH product → Fase 4;
// auto-detect retroactivo sobre productos existentes → Fase 3.
//
// Categorías y modos:
//   - PESCADO + nombre de marisco → pz_per_kg (gamberi 15/20, scampi U/8)
//   - PESCADO sin marisco         → g_per_piece (ricciola 4-6 kg, branzino 400/500 g)
//   - CARNE + pieza entera/ave    → g_per_piece (pichón 450g, pollo entero)
//   - CARNE corte                  → null (sin pezzatura)
//   - FRUTA, PANADERIA            → g_per_piece
//   - resto                        → null
//
// Canónico interno:
//   - pz_per_kg: min/max son piezas por kilo (números chicos típicos 5-50)
//   - g_per_piece: min/max son SIEMPRE gramos por pieza. "2-4 kg" se guarda
//                  como min=2000, max=4000.

import type { ProductCategory } from "@atelier/db";
import type { PezzaturaMode } from "./types";
import { normalizeForMatch } from "./normalize";

export type PezzaturaValue = {
  mode: PezzaturaMode;
  min: number;
  max: number;
};

// ─────────── Keywords por sub-categoría ───────────
// Sin acentos: el matching usa normalizeForMatch que los quita.

const MARISCO_KEYWORDS = [
  "gambero", "gamberi", "gambari", "gamba", "scampo", "scampi", "mazzancolla",
  "langostino", "cigala", "aragosta", "astice", "granchio", "cangrejo",
  "almeja", "vongola", "vongole", "mejillon", "cozza", "cozze",
  "ostra", "ostrica", "ostriche",
  "calamar", "calamaro", "calamari", "sepia", "seppia",
  "pulpo", "polpo", "polpi",
  "ricci", "vieira", "capasanta", "capesante", "cannolicchio", "cannolicchi",
  "navaja", "percebes", "bogavante",
];

const CARNE_PIEZA_KEYWORDS = [
  "pollo", "pollastrello", "gallina", "pichon", "piccione",
  "codorniz", "quaglia", "faraona", "fagiano",
  "perdiz", "pernice", "lepre", "conejo", "coniglio",
  "capriolo", "cervo", "capretto", "agnello", "cordero",
  "pavo", "tacchino", "pato", "anatra", "oca", "ganso",
];

// Word-boundary match: "gamba" matchea "Gamba Rossa" pero NO "gambaletto".
// Mismo patrón que purchase-unit.ts:matchKeyword.
function matchKeyword(haystack: string, keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`).test(haystack);
}

function matchAny(haystack: string, keywords: readonly string[]): boolean {
  return keywords.some((kw) => matchKeyword(haystack, kw));
}

// ─────────── 1. Resolver modo según categoría + nombre ───────────

export function resolvePezzaturaMode(
  name: string,
  category: ProductCategory,
): PezzaturaMode | null {
  const n = normalizeForMatch(name);

  if (category === "pescado") {
    return matchAny(n, MARISCO_KEYWORDS) ? "pz_per_kg" : "g_per_piece";
  }
  if (category === "carne") {
    return matchAny(n, CARNE_PIEZA_KEYWORDS) ? "g_per_piece" : null;
  }
  if (category === "fruta" || category === "panaderia") {
    return "g_per_piece";
  }
  return null;
}

// ─────────── 2. Detección embebida en el nombre ───────────
//
// Busca rangos "X/Y", "X-Y" o valores únicos "X g/kg" dentro del nombre
// del producto. Verifica que el token alfanumérico siguiente (si hay)
// sea una unidad válida — descarta falsos positivos como "Manzana 7-9 cm".

const WEIGHT_UNIT_WORDS = new Set([
  "kg", "g", "gr", "gramos", "grammi", "grams",
]);
const PIECE_UNIT_WORDS = new Set([
  "pz", "pezzo", "pezzi", "pieza", "pza", "piece", "pp", "cad",
]);

export function detectPezzaturaFromName(
  name: string,
  category: ProductCategory,
): PezzaturaValue | null {
  const mode = resolvePezzaturaMode(name, category);
  if (!mode) return null;

  const n = normalizeForMatch(name);

  // U/X (Under, marisco) — degenerado a X/X.
  if (mode === "pz_per_kg") {
    const underMatch = n.match(/\bu\s*\/\s*(\d+(?:[.,]\d+)?)\b/);
    if (underMatch) {
      const result = parsePezzatura(`u/${underMatch[1]}`, category, name);
      if (result) return result;
    }
  }

  // Iterar matches de rango. Para cada uno, mirar la palabra siguiente:
  // si es unidad válida la usamos; si es otro alfa (ej. "cm"), skip.
  // Si no hay palabra siguiente, lo dejamos sin unit (parsePezzatura
  // resuelve por modo).
  const rangeRe = /\b(\d+(?:[.,]\d+)?)\s*[/\-]\s*(\d+(?:[.,]\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = rangeRe.exec(n)) !== null) {
    const a = m[1]!;
    const b = m[2]!;
    const rest = n.slice(m.index + m[0].length).trimStart();
    const nextWord = rest.match(/^([a-z]+\.?)/)?.[1] ?? "";

    let synthInput: string | null = null;
    if (nextWord === "") {
      synthInput = `${a}/${b}`; // sin unidad — resolver por modo
    } else if (WEIGHT_UNIT_WORDS.has(nextWord) || PIECE_UNIT_WORDS.has(nextWord)) {
      synthInput = `${a}/${b} ${nextWord}`;
    }
    // otro token alfa (cm, mm, etc.) → skip este match

    if (synthInput) {
      const result = parsePezzatura(synthInput, category, name);
      if (result) return result;
    }
  }

  // Valor único con unidad de peso (solo g_per_piece).
  if (mode === "g_per_piece") {
    const singleMatch = n.match(/\b(\d+(?:[.,]\d+)?)\s*(kg|gr|g)\b/);
    if (singleMatch) {
      const result = parsePezzatura(
        `${singleMatch[1]} ${singleMatch[2]}`,
        category,
        name,
      );
      if (result) return result;
    }
  }

  return null;
}

// ─────────── 3. Parser de texto libre ───────────

function parseDecimal(s: string): number | null {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function normalizeUnit(s: string): "kg" | "g" | "pz" | null {
  const lower = s.toLowerCase().replace(/\.$/, "");
  if (lower === "kg") return "kg";
  if (WEIGHT_UNIT_WORDS.has(lower) && lower !== "kg") return "g";
  if (PIECE_UNIT_WORDS.has(lower) || lower === "c/u" || lower === "/u") return "pz";
  return null;
}

// Wrap result: si los valores violan invariantes (max<min, negativos, NaN),
// devolver null. Centralizado para no repetirlo en cada try*.
function makeValue(
  mode: PezzaturaMode,
  min: number,
  max: number,
): PezzaturaValue | null {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  if (min < 0 || max < 0) return null;
  if (max < min) return null;
  return { mode, min, max };
}

function tryUnderX(input: string, mode: PezzaturaMode): PezzaturaValue | null {
  // "u/8" → 8/8 (degenerado). Solo aplica a marisco (pz_per_kg).
  const m = input.match(/^u\s*\/\s*(\d+(?:[.,]\d+)?)\s*$/);
  if (!m) return null;
  if (mode !== "pz_per_kg") return null;
  const x = parseDecimal(m[1]!);
  if (x === null || x <= 0) return null;
  return makeValue(mode, x, x);
}

// "X/Y unit" | "X-Y unit" | "X a Y unit" | "X Y unit"  con unidad explícita
const RANGE_WITH_UNIT_RE =
  /^(\d+(?:[.,]\d+)?)\s*(?:\/|-|\s+a\s+|\s+)\s*(\d+(?:[.,]\d+)?)\s+(kg|kg\.|g|gr|gr\.|gramos|grammi|grams|pz|pezzo|pezzi|pieza|pza|piece|pp|cad\.?|c\/u|\/u)(?:\s*\/\s*(?:pz|pezzo|pezzi|pieza|pza|piece|cad\.?))?\s*$/i;

function tryRangeWithUnit(
  input: string,
  mode: PezzaturaMode,
): PezzaturaValue | null {
  const m = input.match(RANGE_WITH_UNIT_RE);
  if (!m) return null;
  const a = parseDecimal(m[1]!);
  const b = parseDecimal(m[2]!);
  const unit = normalizeUnit(m[3]!);
  if (a === null || b === null || unit === null) return null;
  if (a <= 0 || b <= 0) return null;
  if (a > b) return null;

  // Validar unidad vs modo:
  //  - kg/g pertenecen a g_per_piece (canónico en gramos).
  //  - pz pertenece a pz_per_kg.
  if (unit === "kg" || unit === "g") {
    if (mode !== "g_per_piece") return null;
    const factor = unit === "kg" ? 1000 : 1;
    return makeValue(mode, a * factor, b * factor);
  }
  if (unit === "pz") {
    if (mode !== "pz_per_kg") return null;
    return makeValue(mode, a, b);
  }
  return null;
}

// "X/Y" | "X-Y" | "X a Y" | "X Y"  SIN unidad explícita
const RANGE_NO_UNIT_RE =
  /^(\d+(?:[.,]\d+)?)\s*(?:\/|-|\s+a\s+|\s+)\s*(\d+(?:[.,]\d+)?)\s*$/;

function tryRangeNoUnit(
  input: string,
  mode: PezzaturaMode,
): PezzaturaValue | null {
  const m = input.match(RANGE_NO_UNIT_RE);
  if (!m) return null;
  const a = parseDecimal(m[1]!);
  const b = parseDecimal(m[2]!);
  if (a === null || b === null) return null;
  if (a <= 0 || b <= 0) return null;
  if (a > b) return null;

  if (mode === "pz_per_kg") {
    return makeValue(mode, a, b);
  }
  // g_per_piece sin unidad: ambos ≤ 100 ⇒ kg implícito; > 100 ⇒ g implícito.
  // Heurística del spec (sección 2).
  if (a <= 100 && b <= 100) {
    return makeValue(mode, a * 1000, b * 1000);
  }
  return makeValue(mode, a, b);
}

// "X unit" valor único con unidad
const SINGLE_WITH_UNIT_RE =
  /^(\d+(?:[.,]\d+)?)\s*(kg|kg\.|g|gr|gr\.|gramos|grammi|grams|pz|pezzo|pezzi|pieza|pza|piece|pp|cad\.?|c\/u|\/u)(?:\s*\/\s*(?:pz|pezzo|pezzi|pieza|pza|piece|cad\.?))?\s*$/i;

function trySingleWithUnit(
  input: string,
  mode: PezzaturaMode,
): PezzaturaValue | null {
  const m = input.match(SINGLE_WITH_UNIT_RE);
  if (!m) return null;
  const a = parseDecimal(m[1]!);
  const unit = normalizeUnit(m[2]!);
  if (a === null || a <= 0 || unit === null) return null;

  if (unit === "kg" || unit === "g") {
    if (mode !== "g_per_piece") return null;
    const factor = unit === "kg" ? 1000 : 1;
    return makeValue(mode, a * factor, a * factor);
  }
  // "60 pz" solo (sin /kg) no es pezzatura inteligible — null.
  return null;
}

export function parsePezzatura(
  input: string,
  category: ProductCategory,
  name: string,
): PezzaturaValue | null {
  const mode = resolvePezzaturaMode(name, category);
  if (!mode) return null;

  const cleaned = input.trim().toLowerCase();
  if (!cleaned) return null;

  // Cascada: más específico primero.
  for (const tryFn of [tryUnderX, tryRangeWithUnit, tryRangeNoUnit, trySingleWithUnit]) {
    const result = tryFn(cleaned, mode);
    if (result) return result;
  }
  return null;
}

// ─────────── 4. Render canónico ───────────

// Formatea un número con coma decimal y elimina "0,0" trailing.
// 2500 → "2,5"; 3000 → "3"; 2,5 → "2,5"; 60 → "60".
function formatNumberEs(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return String(n).replace(".", ",");
}

export function formatPezzatura(value: PezzaturaValue): string {
  const { mode, min, max } = value;
  const single = min === max;

  if (mode === "pz_per_kg") {
    // Siempre simétrico "X/Y" — para el degenerado uso "X/X" en vez de "X"
    // solo, así parsePezzatura lo re-reconoce sin necesidad de un caso
    // especial (round-trip estable). U/X solo se acepta como input.
    return `${formatNumberEs(min)}/${formatNumberEs(max)}`;
  }

  // g_per_piece: render según magnitud.
  const minKg = min / 1000;
  const maxKg = max / 1000;
  if (min >= 1000) {
    return single
      ? `${formatNumberEs(minKg)} kg/pz`
      : `${formatNumberEs(minKg)}-${formatNumberEs(maxKg)} kg`;
  }
  return single
    ? `${formatNumberEs(min)} g/pz`
    : `${formatNumberEs(min)}/${formatNumberEs(max)} g`;
}
