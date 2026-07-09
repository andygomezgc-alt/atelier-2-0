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

// Regex en dos fases para evitar falsos positivos:
//
//   Fase A: "<num><unidad-pegada> <resto>" — ej. "200g harina", "1.5kg pan"
//   Fase B: "<num> <unidad> [de] <resto>"  — ej. "200 g de harina"
//   Fase C: "<num> <resto>"                — ej. "2 cebollas" → unidad
//
// Cantidad acepta decimal con punto o coma. "1/2" NO se soporta (raro en el
// dataset del chef; si aparece queda como name completo).
const PHASE_A = /^(\d+(?:[.,]\d+)?)\s*([a-z]{1,12})(?:\s+|$)/i;
const PHASE_B = /^(\d+(?:[.,]\d+)?)\s+([a-z]{1,12})\s+(?:de\s+|d'\s*|del\s+|della\s+|di\s+)/i;
// Phase C exige que el resto empiece con letra. Eso descarta fracciones
// "1/2 cebolla" o rangos "2-3 dientes" que dejarían un name con "/" o "-"
// como primer char.
const PHASE_C = /^(\d+(?:[.,]\d+)?)\s+([a-záéíóúüñ].*)$/i;
// Phase D: "<nombre>, <qty> <unit> [(aclaración)]" — formato que usa el
// extractor LLM (recipe-extraction.ts) y a veces el chef. Ejemplos:
//   "Manteca clarificada, 30 g"
//   "Tomate verde, 300 g (clarificado en frío 12 h)"
//   "Caldo de pescado de roca, 1.2 L"
//   "Limón Amalfi, 3 unidades (piel quemada al binchotan)"
//
// Diseño: la `.+` del nombre es GREEDY a propósito — si hay varias comas
// ("Salsa casera, mediterránea, 200 g") queremos cortar en la última coma
// (el qty+unit está al final), no en la primera. El paréntesis aclaratorio
// al final lo descartamos (no entra ni en name ni en aclaración).
const PHASE_D =
  /^(.+),\s*(\d+(?:[.,]\d+)?)\s*([a-záéíóúüñ]+)\s*(?:\([^)]*\))?\s*$/i;

function toNumber(raw: string): number {
  return parseFloat(raw.replace(",", "."));
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

export function parseIngredient(raw: string): ParsedIngredient {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { quantity: null, unit: null, name: trimmed, raw };
  }

  // Fase B antes que A: "200 g de harina" tiene unidad con espacio, le damos
  // prioridad porque es la forma "canónica" del chef y es inequívoca.
  const mB = trimmed.match(PHASE_B);
  if (mB) {
    const qty = toNumber(mB[1]!);
    const unit = UNIT_ALIASES[mB[2]!.toLowerCase()];
    if (unit && !isNaN(qty)) {
      const rest = trimmed.slice(mB[0].length).trim();
      const name = cleanLeading(rest);
      if (name) return { quantity: qty, unit, name, raw };
    }
  }

  // Fase A: cantidad+unidad pegadas, ej. "200g harina"
  const mA = trimmed.match(PHASE_A);
  if (mA) {
    const qty = toNumber(mA[1]!);
    const unit = UNIT_ALIASES[mA[2]!.toLowerCase()];
    if (unit && !isNaN(qty)) {
      const rest = trimmed.slice(mA[0].length).trim();
      const name = cleanLeading(rest);
      if (name) return { quantity: qty, unit, name, raw };
    }
  }

  // Fase C: solo cantidad, ej. "2 cebollas" → asumimos unidad="unidad".
  // Cuidado: queremos rechazar "00 harina" (la cantidad inicia con cero y
  // probablemente sea parte del nombre, ej. "harina 00"). Aceptamos si el
  // número es entero >0 o decimal positivo.
  const mC = trimmed.match(PHASE_C);
  if (mC) {
    const qty = toNumber(mC[1]!);
    const name = cleanLeading(mC[2]!.trim());
    if (!isNaN(qty) && qty > 0 && name) {
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
    const qty = toNumber(mD[2]!);
    const unitStr = mD[3]!.toLowerCase();
    const unit = UNIT_ALIASES[unitStr];
    if (unit && !isNaN(qty) && qty > 0 && name) {
      return { quantity: qty, unit, name, raw };
    }
  }

  return { quantity: null, unit: null, name: trimmed, raw };
}

// Escala la CANTIDAD de una línea de ingrediente por `factor`, reemplazando el
// número EN EL LUGAR (preserva unidad, nombre y formato: "200 g de harina" ×2 →
// "400 g de harina"). Si la línea no tiene cantidad detectable, la devuelve
// intacta. Solo toca ingredientes: el método/notas NO se escalan (mencionar
// "hornear a 180°C" no debe multiplicarse). Redondeo a 2 decimales.
export function scaleIngredientLine(raw: string, factor: number): string {
  if (!isFinite(factor) || factor <= 0) return raw;
  const trimmed = raw.trim();
  const parsed = parseIngredient(trimmed);
  if (parsed.quantity === null) return raw;

  const scaled = Math.round(parsed.quantity * factor * 100) / 100;
  const scaledStr = String(scaled);

  // Caso 1: cantidad al inicio (Fase A/B/C, ej. "200g harina", "2 cebollas").
  if (/^\d/.test(trimmed)) {
    return trimmed.replace(/^\d+(?:[.,]\d+)?/, scaledStr);
  }
  // Caso 2: cantidad antes de la unidad al final (Fase D, ej. "Manteca, 30 g").
  return trimmed.replace(
    /(\d+(?:[.,]\d+)?)(\s*[a-záéíóúüñ]+\s*(?:\([^)]*\))?\s*)$/i,
    `${scaledStr}$2`,
  );
}
