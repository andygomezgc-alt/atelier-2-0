// Parser de strings de ingrediente legacy (los que vivían en
// `Recipe.contentJson.ingredients[]` como texto libre).
//
// Objetivo: extraer cantidad + unidad + nombre limpio para que el matching
// fuzzy compare contra el NOMBRE solo, no contra el string entero. Ejemplos:
//
//   "200g de harina"          → { quantity: 200, unit: "g",      name: "harina" }
//   "1.5 kg tomate san marzano"→ { quantity: 1.5, unit: "kg",     name: "tomate san marzano" }
//   "2 cebollas medianas"     → { quantity: 2,   unit: "unidad", name: "cebollas medianas" }
//   "una pizca de sal"        → { quantity: null, unit: null,    name: "una pizca de sal" }
//   "harina 00"               → { quantity: null, unit: null,    name: "harina 00" }
//   "20 cl ron"               → { quantity: 200, unit: "ml",     name: "ron" }
//   "½ limón"                 → { quantity: 0.5, unit: "unidad", name: "limón" }
//   "1 cucharada de aceite"   → { quantity: null, unit: null,    name: "aceite", measure: "1 cucharada" }
//
// La cantidad/unidad parseada se devuelve pero NO se persiste en
// RecipeIngredient (no hay columnas todavía — el spec las tiene en backlog).
// Lo que SÍ usamos: la unidad sugerida pasa a `unidadCompra` cuando se
// crea un draft, y el nombre limpio se usa para el matching contra el banco.

import type { ProductUnit } from "./types";

export type ParsedIngredient = {
  // Cantidad numérica si se detectó, null si no.
  quantity: number | null;
  // Unidad canónica del banco (kg/g/l/ml/unidad). null si no se detectó.
  // "caja" no se infiere acá — solo aplica para compra, no para receta.
  unit: ProductUnit | null;
  // Nombre limpio (sin cantidad/unidad ni "de" colgado). Si no detectamos
  // cantidad, name === raw.trim().
  name: string;
  // Household measure as written ("1 cucharada") when the line uses one. The
  // quantity and unit stay null: a spoon is not a unit the bank can cost.
  measure?: string;
  // String original sin tocar — lo persistimos en RecipeIngredient.rawText
  // como fallback para debugging / re-migración manual.
  raw: string;
};

// Aliases de unidad → unidad canónica del banco. Las claves están en
// lowercase. Cubre castellano/italiano/inglés porque los chefs mezclan.
// Mantener corto: cada alias es un match exacto (palabra entera), nada
// de substrings (evita que "g" matchee dentro de "gramos").
const UNIT_ALIASES: Record<string, ProductUnit> = {
  // ── peso ──
  g: "g",
  gr: "g",
  grs: "g",
  gramo: "g",
  gramos: "g",
  gram: "g",
  grams: "g",
  kg: "kg",
  kgs: "kg",
  kilo: "kg",
  kilos: "kg",
  kilogramo: "kg",
  kilogramos: "kg",
  // ── volumen ──
  ml: "ml",
  mls: "ml",
  cc: "ml",
  l: "l",
  lt: "l",
  lts: "l",
  litro: "l",
  litros: "l",
  liter: "l",
  liters: "l",
  // ── piezas / unidad ──
  u: "unidad",
  ud: "unidad",
  uds: "unidad",
  un: "unidad",
  unidad: "unidad",
  unidades: "unidad",
  pieza: "unidad",
  piezas: "unidad",
  pz: "unidad",
  pcs: "unidad",
};

// Units the bank does not store but that convert exactly into one it does:
// the quantity is multiplied by `factor`.
const SCALED_UNIT_ALIASES: Record<string, { unit: ProductUnit; factor: number }> = {
  cl: { unit: "ml", factor: 10 },
  dl: { unit: "ml", factor: 100 },
};

/** Resolves a unit word ("gr", "ud", "cl") to a bank unit and the factor to apply to its quantity. */
export function resolveUnit(token: string): { unit: ProductUnit; factor: number } | null {
  const key = token.trim().toLowerCase();
  const direct = UNIT_ALIASES[key];
  if (direct) return { unit: direct, factor: 1 };
  return SCALED_UNIT_ALIASES[key] ?? null;
}

// Household measures: not convertible to a bank unit, so a line that uses
// one keeps quantity and unit null and reports the measure separately.
const HOUSEHOLD_MEASURE =
  String.raw`(?:cucharaditas?|cucharadas?|cdtas?|cdas?|c\/s|cs|tazas?|vasos?|pizcas?|chorritos?|puñados?|tbsp|tsp|cups?|pinch|cucchiaini|cucchiaino|cucchiai|cucchiaio|bicchieri|bicchiere|pizzico)`;
const HOUSEHOLD_WORD = new RegExp(String.raw`^${HOUSEHOLD_MEASURE}\.?$`, "i");

export function isHouseholdMeasure(word: string): boolean {
  return HOUSEHOLD_WORD.test(word.trim());
}

// A quantity token: mixed number "1 1/2", fraction "1/2", unicode fraction
// "½" / "1½" / "1 ½", or a decimal with point or comma ("1.5", "1,5").
export const QUANTITY_PATTERN = String.raw`(?:\d+\s+\d+\/\d+|\d+\/\d+|(?:\d+\s*)?[½¼¾]|\d+(?:[.,]\d+)?)`;
const Q = QUANTITY_PATTERN;

// Regex en varias fases para evitar falsos positivos:
//
//   Fase A: "<num><unidad-pegada> <resto>" — ej. "200g harina", "1.5kg pan"
//   Fase B: "<num> <unidad> [de] <resto>"  — ej. "200 g de harina"
//   Household: "<num> <medida casera> [de] <resto>" — ej. "1 cucharada de aceite"
//   Fase C: "<num> <resto>"                — ej. "2 cebollas" → unidad
const PHASE_A = new RegExp(String.raw`^(${Q})\s*([a-z]{1,12})(?:\s+|$)`, "i");
const PHASE_B = new RegExp(String.raw`^(${Q})\s+([a-z]{1,12})\s+(?:de\s+|d'\s*|del\s+|della\s+|di\s+)`, "i");
const PHASE_HOUSEHOLD = new RegExp(String.raw`^(${Q})\s*(${HOUSEHOLD_MEASURE})\.?(?=\s|$)\s*(?:(?:de|di|of)\s+)?`, "i");
// Phase C exige que el resto empiece con letra. Eso descarta rangos
// "2-3 dientes" que dejarían un name con "-" como primer char.
const PHASE_C = new RegExp(String.raw`^(${Q})\s+([a-záéíóúüñ].*)$`, "i");
// Phase D: "<nombre>, <qty> <unit> [(aclaración)]" — formato que usa el
// extractor LLM (recipe-extraction.ts) y a veces el chef. Ejemplos:
//   "Manteca clarificada, 30 g"
//   "Tomate verde, 300 g (clarificado en frío 12 h)"
//   "Caldo de pescado de roca, 1,2 L"
//   "Limón Amalfi, 3 unidades (piel quemada al binchotan)"
//
// The name is lazy: the `$` anchor still makes "Salsa casera, mediterránea,
// 200 g" split at the last comma, while "Caldo, 1,2 L" keeps the decimal
// comma inside the quantity instead of cutting the name at "Caldo, 1".
// El paréntesis aclaratorio al final lo descartamos.
const PHASE_D = new RegExp(String.raw`^(.+?),\s*(${Q})\s*([a-záéíóúüñ]+)\s*(?:\([^)]*\))?\s*$`, "i");

const UNICODE_FRACTIONS: Record<string, number> = { "½": 0.5, "¼": 0.25, "¾": 0.75 };

// Rounds away binary noise such as 0.3 * 100 = 30.000000000000004.
function roundQuantity(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/** Parses one quantity token ("3", "1,5", "1/2", "1 1/2", "½", "1½"); null if it is not one. */
export function parseQuantity(token: string): number | null {
  const s = token.trim();
  const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)$/) ?? s.match(/^()(\d+)\/(\d+)$/);
  if (mixed) {
    const den = Number(mixed[3]);
    return den === 0 ? null : roundQuantity(Number(mixed[1] || 0) + Number(mixed[2]) / den);
  }
  const unicode = s.match(/^(\d+)?\s*([½¼¾])$/);
  if (unicode) return Number(unicode[1] ?? 0) + UNICODE_FRACTIONS[unicode[2]!]!;
  return /^\d+(?:[.,]\d+)?$/.test(s) ? Number(s.replace(",", ".")) : null;
}

/** Formats a quantity with a decimal comma, at most `maxDecimals` decimals and no trailing zeros. */
export function formatQuantity(n: number, maxDecimals = 3): string {
  const f = 10 ** maxDecimals;
  return String(Math.round(n * f) / f).replace(".", ",");
}

// Palabras de "envasado descriptivo" — el chef escribe "1 mazzetto di
// Basilico" o "1 manojo de perejil"; mazzetto/manojo no son productos sino
// la forma de venta. Las quitamos del name así el draft queda "Basilico"
// (no "mazzetto di Basilico"). La unidad efectiva se queda como "unidad",
// la cantidad sigue siendo 1 — el chef ajusta la unidad real al cargar
// precios en el banco.
const PACKAGING_PREFIX_REGEX =
  /^(?:mazzetto|mazzetti|mazzo|mazzi|ramito|ramillete|atado|atadito|manojo|manojito|racimo|grappolo|grappoli|bouquet|bunch|sprig)\s+(?:de|di|del|della|d')\s+/i;

function cleanLeading(s: string): string {
  // Quita conectores comunes que sobran si el regex deja un "de" suelto.
  let cleaned = s.replace(/^(?:de|d'|del|della|di)\s+/i, "").trim();
  // Y limpia el envasado descriptivo si el resto empieza con uno de los
  // sustantivos comunes ("mazzetto di X", "manojo de X", etc.).
  cleaned = cleaned.replace(PACKAGING_PREFIX_REGEX, "").trim();
  return cleaned;
}

// Quantity token + unit word → bank quantity and unit (cl/dl scaled to ml).
function measured(token: string, unitWord: string): { quantity: number; unit: ProductUnit } | null {
  const qty = parseQuantity(token);
  const resolved = resolveUnit(unitWord);
  if (qty === null || !resolved) return null;
  return { quantity: roundQuantity(qty * resolved.factor), unit: resolved.unit };
}

export function parseIngredient(raw: string): ParsedIngredient {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { quantity: null, unit: null, name: trimmed, raw };
  }

  // Fase B antes que A: "200 g de harina" tiene unidad con espacio, le damos
  // prioridad porque es la forma "canónica" del chef y es inequívoca.
  const mB = trimmed.match(PHASE_B);
  if (mB) {
    const m = measured(mB[1]!, mB[2]!);
    if (m) {
      const rest = trimmed.slice(mB[0].length).trim();
      const name = cleanLeading(rest);
      if (name) return { ...m, name, raw };
    }
  }

  // Fase A: cantidad+unidad pegadas, ej. "200g harina"
  const mA = trimmed.match(PHASE_A);
  if (mA) {
    const m = measured(mA[1]!, mA[2]!);
    if (m) {
      const rest = trimmed.slice(mA[0].length).trim();
      const name = cleanLeading(rest);
      if (name) return { ...m, name, raw };
    }
  }

  // Household guard: "1 cucharada de aceite" must not become 1 "unidad" of
  // "cucharada de aceite". Quantity and unit stay null; the measure is kept.
  const mH = trimmed.match(PHASE_HOUSEHOLD);
  if (mH) {
    const name = cleanLeading(trimmed.slice(mH[0].length).trim());
    if (name) return { quantity: null, unit: null, name, measure: `${mH[1]!.trim()} ${mH[2]!}`, raw };
  }

  // Fase C: solo cantidad, ej. "2 cebollas" → asumimos unidad="unidad".
  // Cuidado: queremos rechazar "00 harina" (la cantidad inicia con cero y
  // probablemente sea parte del nombre, ej. "harina 00"). Aceptamos si el
  // número es entero >0 o decimal positivo.
  const mC = trimmed.match(PHASE_C);
  if (mC) {
    const qty = parseQuantity(mC[1]!);
    const name = cleanLeading(mC[2]!.trim());
    if (qty !== null && qty > 0 && name) {
      return { quantity: qty, unit: "unidad", name, raw };
    }
  }

  // Fase D: cantidad+unidad al FINAL, separados del nombre por coma.
  // Probamos esta fase última porque el resto del trabajo del parser
  // (Phase A/B/C) cubre los casos "cantidad al inicio" que son más comunes
  // en data del chef. Phase D es para el formato del extractor LLM.
  const mD = trimmed.match(PHASE_D);
  if (mD) {
    const name = mD[1]!.trim();
    const m = measured(mD[2]!, mD[3]!);
    if (m && m.quantity > 0 && name) {
      return { ...m, name, raw };
    }
  }

  return { quantity: null, unit: null, name: trimmed, raw };
}

const LEADING_QUANTITY = new RegExp(String.raw`^${Q}`);
const LEADING_RANGE = new RegExp(String.raw`^(${Q})(\s*[-–—]\s*)(${Q})(?=\s|[a-z]|$)`, "i");
const TRAILING_QUANTITY = new RegExp(String.raw`(${Q})(\s*[a-záéíóúüñ]+\s*(?:\([^)]*\))?\s*)$`, "i");

// Escala la CANTIDAD de una línea de ingrediente por `factor`, reemplazando el
// número EN EL LUGAR (preserva unidad, nombre y formato: "200 g de harina" ×2 →
// "400 g de harina"). Si la línea no tiene cantidad detectable, la devuelve
// intacta. Solo toca ingredientes: el método/notas NO se escalan (mencionar
// "hornear a 180°C" no debe multiplicarse).
//
// Rounds to 3 decimals, like RecipeIngredient.qty (Decimal(10,3)) and the
// standard line, so the scaled rawText still parses to the scaled qty.
// The literal token is scaled, never the converted value: "20 cl ron" x2 is
// "40 cl ron", "1/2 cebolla" x2 is "1 cebolla". Spoon lines and both ends of
// a leading range ("2-3 dientes") scale too. Decimals use a comma.
export function scaleIngredientLine(raw: string, factor: number): string {
  if (!isFinite(factor) || factor <= 0) return raw;
  const trimmed = raw.trim();
  const scale = (token: string): string => {
    const qty = parseQuantity(token);
    return qty === null ? token : formatQuantity(qty * factor);
  };

  const range = trimmed.match(LEADING_RANGE);
  if (range) return scale(range[1]!) + range[2]! + scale(range[3]!) + trimmed.slice(range[0].length);

  const parsed = parseIngredient(trimmed);
  if (parsed.quantity === null && parsed.measure === undefined) return raw;

  // Caso 1: cantidad al inicio (Fase A/B/C/household, ej. "200g harina", "2 cebollas").
  const leading = trimmed.match(LEADING_QUANTITY);
  if (leading) return scale(leading[0]) + trimmed.slice(leading[0].length);
  // Caso 2: cantidad antes de la unidad al final (Fase D, ej. "Manteca, 30 g").
  return trimmed.replace(TRAILING_QUANTITY, (_m, token: string, tail: string) => scale(token) + tail);
}
