// Standard ingredient format: one shape and one text line for every entry
// point (assistant chat, "save as recipe", PDF/photo/Google Doc extraction
// and manual entry), so the product bank and the cost engine recognise the
// ingredients.
//
//   shape:     { section, qty, unit, name, note, pieceWeightG }
//   rawText:   "400 g rape limpio" | "4 ud calamar" | "aceite"
//   display:   rawText + ", " + note
//
// Invariant: parseIngredient(formatIngredientLine(i)) returns exactly
// i.qty, i.unit and i.name. The normalizer below is deterministic: no AI.

import { z } from "zod";
import { normalizeForMatch } from "./normalize";
import {
  QUANTITY_PATTERN,
  formatQuantity,
  isHouseholdMeasure,
  parseIngredient,
  parseQuantity,
  resolveUnit,
} from "./parser";

export const STANDARD_UNITS = ["g", "kg", "ml", "l", "unidad"] as const;
export type StandardUnit = (typeof STANDARD_UNITS)[number];

export const StandardIngredientSchema = z
  .object({
    section: z.string().trim().min(1).max(80).nullable(),
    qty: z.number().positive().finite().nullable(),
    unit: z.enum(STANDARD_UNITS).nullable(),
    name: z.string().trim().min(1).max(200),
    note: z.string().trim().min(1).max(300).nullable(),
    pieceWeightG: z.number().positive().finite().nullable(),
  })
  .refine((i) => (i.qty === null) === (i.unit === null), {
    message: "qty and unit must both be set or both be null",
    path: ["unit"],
  });
export type StandardIngredient = z.infer<typeof StandardIngredientSchema>;

/** What the normalizer changed, in a fixed order. */
export const STANDARDIZE_FLAGS = [
  "markdown", "fraction", "range", "cl_dl", "household", "note_split", "piece_weight", "unmeasured",
] as const;
export type StandardizeFlag = (typeof STANDARDIZE_FLAGS)[number];
export type StandardizeOptions = { knownSections?: readonly string[] };
export type StandardizeResult = { ingredient: StandardIngredient; flags: StandardizeFlag[] };

/** Lenient AI output: a plain line, or an object whose fields may be loosely typed. */
export type AiIngredient =
  | string
  | {
      section?: string | null;
      qty?: number | string | null;
      unit?: string | null;
      name?: string | null;
      note?: string | null;
      pieceWeightG?: number | string | null;
    };

/** Canonical rawText: "400 g rape limpio", "1,5 kg harina", "4 ud calamar" or just "aceite". */
export function formatIngredientLine(i: StandardIngredient): string {
  if (i.qty === null || i.unit === null) return i.name;
  return `${formatQuantity(i.qty)} ${i.unit === "unidad" ? "ud" : i.unit} ${i.name}`;
}

/** The line shown to people (and stored in contentJson): rawText plus the note. */
export function displayLine(i: StandardIngredient): string {
  return formatIngredientLine(i) + (i.note ? `, ${i.note}` : "");
}

// ── Normalizer ──────────────────────────────────────────────────────────────

const Q = QUANTITY_PATTERN;
const QTY_FLAGS: readonly StandardizeFlag[] = ["fraction", "range", "cl_dl", "household", "unmeasured"];
const FRACTION_TOKEN = /[/½¼¾]/;
const IMPERIAL_UNIT = /^(?:oz|lbs?|qt|pt|gal)\.?$/i;

// List markers: "-", "*", "•", or "1." / "1)" followed by a space. "1.5 kg"
// keeps its quantity because no space follows the dot.
const BULLET = /^(?:[-*•·–—](?:\s+|$)|\d{1,2}[.)]\s+)+/;
// The note starts at the first ", " or "(".
const NOTE_START = /,\s|\s*\(/;
const LEADING_RANGE = new RegExp(String.raw`^((${Q})\s*[-–—]\s*(${Q}))\s+(?=\S)`, "i");
const LEADING_IMPERIAL = new RegExp(String.raw`^(${Q})\s*(oz|lbs?|qt|pt|gal)\.?\s+(?:(?:de|di|of)\s+)?(?=\S)`, "i");
const LEADING_TOKEN = new RegExp(String.raw`^(${Q})\s*([a-z]+)?`, "i");
// A whole quantity phrase: "8 g", "2-3", "5 cl", "1 cucharada", "2 lb".
const PHRASE = new RegExp(String.raw`^((${Q})(?:\s*[-–—]\s*(${Q}))?)\s*([^\s\d].*)?$`, "i");
// Name-first with the quantity at the end: "Harina 200 g", "aceite 1 cucharada".
const TRAILING_PHRASE = new RegExp(
  String.raw`^(.+?)\s+((?:${Q})(?:\s*[-–—]\s*(?:${Q}))?\s*[a-záéíóúüñ/]+\.?)$`, "i",
);

// Piece weight: "de 350 g aprox.", "350 g c/u", "60 g cada uno".
const GRAM_UNIT = String.raw`(g|gr|grs|gramos|kg)`;
const APPROX = String.raw`(?:aprox\.?|aproximadamente|approx\.?|circa)`;
const EACH = String.raw`(?:c/u|cada\s+un[oa]|cada\s+pieza|each|ciascun[oa]|l'un[oa])`;
const PIECE_BODY =
  String.raw`(?:(?:de|di|da)\s+(${Q})\s*${GRAM_UNIT}\.?(?:\s+${APPROX})?(?:\s+${EACH})?` +
  String.raw`|(${Q})\s*${GRAM_UNIT}\.?(?:\s+${APPROX})?\s+${EACH})`;
const PIECE_IN_NAME = new RegExp(String.raw`\s+${PIECE_BODY}(?=\s|$)`, "i");
const PIECE_PART = new RegExp(String.raw`^${PIECE_BODY}\.?$`, "i");

// "To taste" expressions: no measure at all, the cook seasons by eye.
// "c/s" and "cs" are household measures in the parser.
const TO_TASTE = String.raw`(?:q\.?\s?b\.?|quanto\s+basta|al?\s+gusto|a\s+piacere|c\.\s?s\.?)`;
const TO_TASTE_PHRASE = new RegExp(String.raw`^${TO_TASTE}$`, "i");
const TRAILING_TO_TASTE = new RegExp(String.raw`^(.+?)\s+(${TO_TASTE})$`, "i");
// Packaging with no standard weight ("1 sobre", "2 latas"): the chef completes the quantity.
const PACKAGING = String.raw`(?:sobres?|bustin[ae]|latas?|botes?|vasett[oi]|ramett[oi]|manojos?|mazzett[oi])`;
const PACKAGING_WORD = new RegExp(String.raw`^${PACKAGING}$`, "i");
const LEADING_PACKAGING = new RegExp(
  String.raw`^(${Q})\s+(${PACKAGING})\s+(?:(?:de|di|del|della|of)\s+|d['’]\s*)?(?=\S)`, "i",
);

const SECTION_PREFIX = /^(?:para\s+(?:el|la|los|las)\s+|per\s+(?:il|lo|la|i|gli|le)\s+|per\s+l['’]\s*|for\s+the\s+)/i;
const GENERIC_HEADERS = new Set(["ingredientes", "ingredients", "ingredienti"]);
const METHOD_HEADERS = new Set([
  "metodo", "method", "procedimiento", "procedimento", "preparazione", "preparacion", "elaboracion",
]);

type Part = { text: string; paren: boolean };
type Draft = {
  source: string;
  section: string | null;
  qty: number | null;
  unit: StandardUnit | null;
  name: string;
  measureNotes: string[]; // household, range or unconvertible measure: first in the note
  parts: Part[]; // text split off the line: the rest of the note
  notes: string[]; // notes given explicitly (AI `note` field)
  pieceWeightG: number | null;
  flags: Set<StandardizeFlag>;
};
type QtyPhrase = { qty: number | null; unit: StandardUnit | null; measureNote: string | null; flags: StandardizeFlag[] };

function isStandardUnit(unit: string): unit is StandardUnit {
  return (STANDARD_UNITS as readonly string[]).includes(unit);
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function clip(text: string, max: number): string {
  return text.slice(0, max).trim();
}

function stripMarkdown(text: string): { text: string; changed: boolean } {
  const trimmed = text.trim();
  const stripped = trimmed.replace(BULLET, "").replace(/\*\*|__|`/g, "");
  return { text: stripped.replace(/\s+/g, " ").trim(), changed: stripped !== trimmed };
}

// Splits "muy frío (o merluza), sin piel" into its comma parts and
// parentheticals. Commas inside parentheses and decimal commas do not split.
function splitParts(rest: string): Part[] {
  const parts: Part[] = [];
  const push = (text: string, paren: boolean) => {
    const t = text.trim();
    if (t) parts.push({ text: t, paren });
  };
  let buf = "";
  let depth = 0;
  for (let i = 0; i < rest.length; i++) {
    const ch = rest[i]!;
    if (ch === "(") {
      if (depth === 0) {
        push(buf, false);
        buf = "";
      } else buf += ch;
      depth++;
    } else if (ch === ")" && depth > 0) {
      depth--;
      if (depth === 0) {
        push(buf, true);
        buf = "";
      } else buf += ch;
    } else if (ch === "," && depth === 0 && !(/\d/.test(rest[i - 1] ?? "") && /\d/.test(rest[i + 1] ?? ""))) {
      push(buf, false);
      buf = "";
    } else buf += ch;
  }
  push(buf, depth > 0);
  return parts;
}

function splitNote(text: string): { main: string; parts: Part[] } {
  const m = NOTE_START.exec(text);
  if (!m || m.index === 0) return { main: text, parts: [] };
  return { main: text.slice(0, m.index).trim(), parts: splitParts(text.slice(m.index)) };
}

function parseQuantityPhrase(text: string, allowUnknownUnit: boolean): QtyPhrase | null {
  const t = text.trim();
  if (isHouseholdMeasure(t) || TO_TASTE_PHRASE.test(t)) return { qty: null, unit: null, measureNote: t, flags: ["household"] };
  const m = PHRASE.exec(t);
  if (!m) return null;
  const [, qtyText, low, high, rawWord] = m;
  const value = parseQuantity(high ?? low!);
  if (value === null || value <= 0) return null;
  const word = (rawWord ?? "").trim();
  if (word && isHouseholdMeasure(word)) return { qty: null, unit: null, measureNote: t, flags: ["household"] };

  const resolved = word ? resolveUnit(word.replace(/\.$/, "")) : { unit: "unidad" as const, factor: 1 };
  if (resolved && isStandardUnit(resolved.unit)) {
    const flags: StandardizeFlag[] = [];
    if (FRACTION_TOKEN.test(high ?? low!)) flags.push("fraction");
    if (high) flags.push("range");
    if (resolved.factor !== 1) flags.push("cl_dl");
    return { qty: value * resolved.factor, unit: resolved.unit, measureNote: high ? qtyText! : null, flags };
  }
  if (IMPERIAL_UNIT.test(word) || PACKAGING_WORD.test(word) || (allowUnknownUnit && /^[a-záéíóúüñ./]+$/i.test(word))) {
    return { qty: null, unit: null, measureNote: t, flags: ["unmeasured"] };
  }
  return null;
}

function applyPhrase(d: Draft, p: QtyPhrase): void {
  d.qty = p.qty;
  d.unit = p.unit;
  if (p.measureNote) d.measureNotes.push(p.measureNote);
  for (const f of p.flags) d.flags.add(f);
}

function draftFromLine(text: string): Draft {
  const md = stripMarkdown(text);
  const { main, parts } = splitNote(md.text);
  const d: Draft = {
    source: md.text, section: null, qty: null, unit: null, name: main,
    measureNotes: [], parts, notes: [], pieceWeightG: null, flags: new Set(),
  };
  if (md.changed) d.flags.add("markdown");

  // Ranges keep the upper bound (cost is never underestimated) and the
  // original "2-3" in the note.
  const range = LEADING_RANGE.exec(main);
  const rangeText = range ? range[1]! : null;
  const quantityFirst = range ? `${range[3]!} ${main.slice(range[0].length)}` : main;

  const imperial = LEADING_IMPERIAL.exec(quantityFirst);
  if (imperial) {
    d.name = quantityFirst.slice(imperial[0].length);
    d.measureNotes.push(`${rangeText ?? imperial[1]!} ${imperial[2]!}`);
    d.flags.add("unmeasured");
    return d;
  }
  const packaging = LEADING_PACKAGING.exec(quantityFirst);
  if (packaging) {
    d.name = quantityFirst.slice(packaging[0].length);
    d.measureNotes.push(`${rangeText ?? packaging[1]!} ${packaging[2]!}`);
    d.flags.add("unmeasured");
    return d;
  }

  const parsed = parseIngredient(quantityFirst);
  if (parsed.measure !== undefined) {
    const word = parsed.measure.slice(parsed.measure.lastIndexOf(" ") + 1);
    d.name = parsed.name;
    d.measureNotes.push(rangeText ? `${rangeText} ${word}` : parsed.measure);
    d.flags.add("household");
    return d;
  }
  if (parsed.quantity !== null && parsed.unit !== null && isStandardUnit(parsed.unit)) {
    d.qty = parsed.quantity;
    d.unit = parsed.unit;
    d.name = parsed.name;
    const lead = LEADING_TOKEN.exec(quantityFirst);
    if (lead && FRACTION_TOKEN.test(lead[1]!)) d.flags.add("fraction");
    if (lead && /^(?:cl|dl)$/i.test(lead[2] ?? "")) d.flags.add("cl_dl");
    if (rangeText) {
      d.measureNotes.push(rangeText);
      d.flags.add("range");
    }
    return d;
  }

  // Name first: "Sal fina, 8 g" / "Sal fina (8 g)".
  const first = parts[0] ? parseQuantityPhrase(parts[0].text, false) : null;
  if (first) {
    parts.shift();
    applyPhrase(d, first);
    return d;
  }
  // Name first without a comma: "Harina 200 g", "aceite 1 cucharada".
  const trailing = TRAILING_PHRASE.exec(main);
  const phrase = trailing && !/\s(?:de|di|da)$/i.test(trailing[1]!) ? parseQuantityPhrase(trailing[2]!, false) : null;
  if (trailing && phrase) {
    d.name = trailing[1]!;
    applyPhrase(d, phrase);
    return d;
  }
  // "Sale q.b.", "pimienta al gusto"
  const toTaste = TRAILING_TO_TASTE.exec(main);
  if (toTaste) {
    d.name = toTaste[1]!;
    d.measureNotes.push(toTaste[2]!);
    d.flags.add("household");
    return d;
  }
  // "sal c/s"
  const lastSpace = main.lastIndexOf(" ");
  if (lastSpace > 0 && isHouseholdMeasure(main.slice(lastSpace + 1))) {
    d.name = main.slice(0, lastSpace);
    d.measureNotes.push(main.slice(lastSpace + 1));
    d.flags.add("household");
  }
  return d;
}

function gramsOf(token: string, unitWord: string): number | null {
  const value = parseQuantity(token);
  if (value === null || value <= 0) return null;
  return round3(unitWord.toLowerCase() === "kg" ? value * 1000 : value);
}

function pieceWeightIn(name: string): { name: string; grams: number } | null {
  const m = PIECE_IN_NAME.exec(name);
  const grams = m ? gramsOf((m[1] ?? m[3])!, (m[2] ?? m[4])!) : null;
  if (!m || grams === null) return null;
  return { name: `${name.slice(0, m.index)} ${name.slice(m.index + m[0].length)}`.trim(), grams };
}

function pieceWeightPart(text: string): number | null {
  const m = PIECE_PART.exec(text);
  return m ? gramsOf((m[1] ?? m[3])!, (m[2] ?? m[4])!) : null;
}

function pieceWeightField(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? round3(value) : null;
  if (typeof value !== "string") return null;
  const m = new RegExp(String.raw`^(${Q})\s*(g|gr|grs|gramos|kg)?\.?$`, "i").exec(value.trim());
  return m ? gramsOf(m[1]!, m[2] ?? "g") : null;
}

// Simple, deterministic plural → singular rules, only for counted pieces.
// Spanish plurals end in -s; Italian ones in -i or -e. Other names stay as written.
const SINGULAR_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/ones$/i, "ón"], // limones → limón
  [/ines$/i, "ín"], // calabacines → calabacín
  [/([aeu])nes$/i, "$1n"], // panes → pan
  [/([aeiou])ces$/i, "$1z"], // nueces → nuez
  [/([aeiou])res$/i, "$1r"], // calamares → calamar
  [/([aeiou])les$/i, "$1l"], // caracoles → caracol
  [/([aeio])s$/i, "$1"], // tomates → tomate, huevos → huevo, kiwis → kiwi
  [/oni$/i, "one"], // limoni → limone
  [/ri$/i, "ro"], // pomodori → pomodoro
  [/lle$/i, "lla"], // cipolle → cipolla
  [/ine$/i, "ina"], // zucchine → zucchina
  [/ane$/i, "ana"], // melanzane → melanzana
  [/ova$/i, "ovo"], // uova → uovo
];
const NAME_CONNECTORS = new Set([
  "de", "del", "della", "delle", "dei", "degli", "di", "da", "con", "al", "alla", "a", "en", "in",
  "para", "per", "sin", "senza", "y", "e", "o", "of", "with",
]);

function singularizeWord(word: string): string {
  if (word.length <= 3 || word === word.toUpperCase() || /[áéíóú]s$/i.test(word)) return word;
  for (const [pattern, replacement] of SINGULAR_RULES) {
    if (pattern.test(word)) return word.replace(pattern, replacement);
  }
  return word;
}

// Singularizes the head of the name: "huevos camperos" → "huevo campero",
// "dientes de ajo" → "diente de ajo".
function singularizeName(name: string): string {
  const words = name.split(" ");
  for (let i = 0; i < words.length; i++) {
    const word = words[i]!;
    if (NAME_CONNECTORS.has(word.toLowerCase()) || /\d/.test(word)) break;
    words[i] = singularizeWord(word);
  }
  return words.join(" ");
}

function cleanSectionName(raw: string): string {
  const base = raw.replace(/\*\*|__|`/g, "").replace(/^#+\s*/, "").trim().replace(/:\s*$/, "").trim();
  const stripped = base.replace(SECTION_PREFIX, "").trim() || base;
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

function sectionKey(raw: string): string {
  return normalizeForMatch(cleanSectionName(raw));
}

function finalize(d: Draft, knownSections: readonly string[]): StandardizeResult {
  const flags = d.flags;
  const known = new Map(knownSections.map((s) => [sectionKey(s), s] as const));
  let section = d.section;
  let parts = d.parts.filter((p) => {
    const hit = p.paren ? known.get(sectionKey(p.text)) : undefined;
    if (hit === undefined) return true;
    section ??= cleanSectionName(hit);
    return false;
  });

  let qty = d.qty !== null && d.qty > 0 ? round3(d.qty) : null;
  const unit = qty === null ? null : d.unit;
  if (unit === null) qty = null;
  let name = d.name;
  let pieceWeightG = d.pieceWeightG;
  if (unit === "unidad") {
    const inName = pieceWeightIn(name);
    if (inName) {
      name = inName.name;
      pieceWeightG ??= inName.grams;
      flags.add("piece_weight");
    }
    parts = parts.filter((p) => {
      const grams = pieceWeightPart(p.text);
      if (grams === null) return true;
      pieceWeightG ??= grams;
      flags.add("piece_weight");
      return false;
    });
    if (qty !== null && qty > 1) name = singularizeName(name);
  }

  name = name.replace(/\s+/g, " ").replace(/[\s.,;:]+$/, "").trim();
  // Keep the name a fixed point of the parser so the rawText invariant holds
  // (the parser drops a leading "de" or a packaging word such as "manojo de").
  if (unit !== null && name) name = parseIngredient(`1 g ${name}`).name || name;
  if (!name) name = d.source;
  if (parts.length > 0) flags.add("note_split");

  const seen = new Set<string>();
  const notes = [...d.measureNotes, ...parts.map((p) => p.text), ...d.notes].filter((n) => {
    const key = normalizeForMatch(n);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const note = clip(notes.join(", "), 300);

  return {
    ingredient: {
      section: section ? clip(section, 80) : null,
      qty,
      unit,
      name: clip(name, 200),
      note: note || null,
      pieceWeightG,
    },
    flags: STANDARDIZE_FLAGS.filter((f) => flags.has(f)),
  };
}

/** Normalizes one free-text ingredient line into the standard shape. */
export function standardizeIngredientLine(text: string, opts: StandardizeOptions = {}): StandardizeResult {
  return finalize(draftFromLine(text), opts.knownSections ?? []);
}

/** Normalizes one AI ingredient (a line or a loosely typed object) into the standard shape. */
export function standardizeIngredient(item: AiIngredient, opts: StandardizeOptions = {}): StandardizeResult {
  if (typeof item === "string") return standardizeIngredientLine(item, opts);
  const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

  // The name goes through the line rules too: an AI may still stuff the
  // quantity, the note or the section into it.
  const d = draftFromLine(str(item.name));
  const section = str(item.section);
  if (section) d.section = cleanSectionName(section);

  const qtyText = typeof item.qty === "number" ? (Number.isFinite(item.qty) ? String(item.qty) : "") : str(item.qty);
  const unitText = str(item.unit);
  const phrase = qtyText || unitText ? parseQuantityPhrase(`${qtyText} ${unitText}`.trim(), true) : null;
  if (phrase) {
    for (const f of QTY_FLAGS) d.flags.delete(f);
    d.measureNotes = [];
    applyPhrase(d, phrase);
  }

  const note = str(item.note);
  if (note) d.notes.push(note);
  const pieceWeightG = pieceWeightField(item.pieceWeightG);
  if (pieceWeightG !== null) d.pieceWeightG = pieceWeightG;

  const knownSections = opts.knownSections ?? [];
  return finalize(d, section ? [...knownSections, section] : knownSections);
}

function headerOf(line: string): string | null {
  const t = line.trim();
  const heading = /^#{1,6}\s+(.+?)\s*#*$/.exec(t);
  if (heading) return heading[1]!;
  const bold = /^(?:\*\*|__)([^*_]+?)(?:\*\*|__)\s*:?$/.exec(t);
  if (bold) return bold[1]!;
  const plain = t.replace(BULLET, "");
  if (plain.endsWith(":")) return plain.slice(0, -1);
  // "Ingredientes" or "Método" without a colon is a header too.
  const key = normalizeForMatch(plain);
  return GENERIC_HEADERS.has(key) || METHOD_HEADERS.has(key) ? plain : null;
}

type Header = { kind: "list" } | { kind: "method" } | { kind: "section"; name: string };

function classifyHeader(line: string): Header | null {
  const header = headerOf(line);
  if (header === null) return null;
  const name = cleanSectionName(header);
  const key = normalizeForMatch(name);
  if (METHOD_HEADERS.has(key)) return { kind: "method" };
  return name && !GENERIC_HEADERS.has(key) ? { kind: "section", name } : { kind: "list" };
}

/**
 * Normalizes an ingredient list. Bold-only lines (**Farsa**), lines ending
 * in ":" (Para la farsa:) and markdown headings are section headers; the
 * lines below them take that section. "Ingredientes" resets the section; a
 * method header ("Método", "Procedimento") ends the list until the next
 * "Ingredientes", so its steps are never ingredients.
 */
export function standardizeIngredientLines(
  lines: readonly string[],
  opts: StandardizeOptions = {},
): { ingredients: StandardIngredient[]; flags: StandardizeFlag[] } {
  const headers = lines.map(classifyHeader);
  const knownSections = [
    ...(opts.knownSections ?? []),
    ...headers.flatMap((h) => (h?.kind === "section" ? [h.name] : [])),
  ];
  const ingredients: StandardIngredient[] = [];
  const flags = new Set<StandardizeFlag>();
  let section: string | null = null;
  let inMethod = false;

  lines.forEach((text, index) => {
    const header = headers[index];
    if (header) {
      if (header.kind === "method") inMethod = true;
      else if (header.kind === "list") {
        inMethod = false;
        section = null;
      } else if (!inMethod) section = clip(header.name, 80);
      return;
    }
    if (inMethod) return;
    const result = standardizeIngredientLine(text, { knownSections });
    if (!result.ingredient.name) return;
    ingredients.push(result.ingredient.section === null ? { ...result.ingredient, section } : result.ingredient);
    for (const f of result.flags) flags.add(f);
  });
  return { ingredients, flags: STANDARDIZE_FLAGS.filter((f) => flags.has(f)) };
}

// ── Prompt rules ────────────────────────────────────────────────────────────

const MEASURED_UNITS = STANDARD_UNITS.filter((u) => u !== "unidad").join(", ");

/** Shared core of the ingredient rules, injected into every prompt (Spanish, tuteo). */
export const INGREDIENT_RULES = [
  "Formato de ingredientes:",
  "- Un ingrediente por línea: cantidad + unidad + producto y, tras una coma, la nota (p. ej. «400 g rape limpio, muy frío»).",
  `- Unidades: solo ${MEASURED_UNITS} o «ud» para piezas («4 ud calamar»).`,
  "- El producto, tal como se compra; en singular si va por piezas.",
  "- Lo que hace la cocina (picado, muy frío, alternativas) va en la nota.",
].join("\n");

const RULE_CLAUSES: Record<"chat" | "extraction", readonly string[]> = {
  chat: [
    "- Escribe gramos o ml en lugar de cucharadas.",
    "- Pon un subtítulo en negrita por elaboración (p. ej. **Farsa**) y debajo sus ingredientes; nunca pegues la elaboración a la línea del ingrediente.",
  ],
  extraction: [
    "- Reescribe cada ingrediente a este formato; no copies el texto tal cual.",
    "- En `unit`, las piezas van como «unidad».",
    "- Si no hay medida métrica, deja `qty` en null y pon la medida original en `note`.",
    "- La elaboración va en `section`; nunca en el nombre.",
  ],
};

/** The ingredient rules for one prompt: the shared core plus its own clause. */
export function renderRules(kind: "chat" | "extraction"): string {
  return [INGREDIENT_RULES, ...RULE_CLAUSES[kind]].join("\n");
}

/** JSON schema of one extracted ingredient, for an AI tool schema. */
export const EXTRACTION_INGREDIENT_JSON_SCHEMA = {
  type: "object",
  properties: {
    section: {
      type: ["string", "null"],
      description: "Elaboración a la que pertenece (p. ej. «Farsa»); null si la receta no tiene elaboraciones.",
    },
    qty: {
      type: ["number", "null"],
      description: `Cantidad en ${MEASURED_UNITS} o en piezas; null si no hay medida métrica.`,
    },
    unit: {
      type: ["string", "null"],
      enum: [...STANDARD_UNITS, null],
      description: `Una de: ${STANDARD_UNITS.join(", ")} («unidad» para piezas); null si qty es null.`,
    },
    name: {
      type: "string",
      description: "Producto tal como se compra, en singular si va por piezas; sin cantidad, nota ni elaboración.",
    },
    note: {
      type: ["string", "null"],
      description: "Lo que hace la cocina (picado, muy frío, alternativas) y la medida original si no es métrica; null si no hay.",
    },
    pieceWeightG: {
      type: ["number", "null"],
      description: "Peso de una pieza en gramos, si consta (p. ej. 350 en «4 calamares de 350 g»); null si no.",
    },
  },
  required: ["section", "qty", "unit", "name", "note", "pieceWeightG"],
  additionalProperties: false,
} as const;
