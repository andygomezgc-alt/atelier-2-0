// Asigna la unidad de compra por defecto a un producto del banco según
// categoría + heurística sobre el nombre.
//
// Reglas (precisión 2 del sub-paso 6):
//   - Sólidos (pescado, carne, verdura, fruta, especia, hierba, seco) → kg.
//   - Líquidos (aceites, vinagres, leches, salsas líquidas, alcoholes) → l.
//   - Naturalmente contables (huevos, latas, frascos, dientes, manojos) → unidad.
//
// El categorizer puede confundir un líquido con "lácteo" (Leche de Almendra
// → categoría lácteo, pero es líquido). Por eso la heurística sobre el
// NOMBRE corre primero para detectar líquidos explícitos antes de caer al
// fallback por categoría.
//
// El chef puede sobreescribir la unidadCompra desde el detalle del producto
// (ChoiceSheet de sub-paso 2b). Este helper es solo para asignar el default
// inicial al crear/migrar.

import type { ProductCategory, ProductUnit } from "@atelier/shared";
import { normalizeForMatch } from "./defaults";

// Heurística: palabras que indican que el producto es LÍQUIDO. Si el nombre
// matchea cualquiera, unidad por defecto = "l", sin importar la categoría.
// Substring sobre nombre normalizado (lower, sin acentos).
const LIQUID_KEYWORDS: ReadonlyArray<string> = [
  "aceite", "olio", "oil",
  "vinagre", "aceto", "vinegar",
  "leche", "latte", "milk",
  "caldo", "brodo", "broth", "stock",
  "salsa", "sauce", "salsina",
  "vino", "wine",
  "cerveza", "birra", "beer",
  "agua", "acqua", "water",
  "jugo", "juice", "succo",
  "shio koji", "shio-koji",
  "garum", "colatura",
  "mirin", "sake",
  "ron", "rum", "whisky", "whiskey", "gin", "vodka",
  "licor", "liquore", "liquor",
];

// Palabras que indican que el producto es NATURALMENTE CONTABLE (no en peso
// ni volumen). Substring también. Override sobre cualquier otra regla.
// Ej. "huevo" → unidad. "diente de ajo" → unidad. "lata de tomate" → unidad.
const COUNTABLE_KEYWORDS: ReadonlyArray<string> = [
  "huevo", "huevos", "uovo", "uova", "egg",
  "lata", "latas", "can", "cans", "tin",
  "frasco", "frascos", "jar",
  "bote", "botes", "bottle", "bottles",
  "paquete", "paquetes", "pack",
  "diente de ajo", "spicchio",
  "hoja de", "foglia di",
  // Premium "por pieza" — el chef compra individualmente
  "trufa", "tartufo", "truffe", "truffle",
  "bottarga", "botarga",
];

// Sólidos por categoría (kg) — todo lo que NO es líquido ni contable.
const SOLID_CATEGORIES: ReadonlySet<ProductCategory> = new Set([
  "pescado",
  "carne",
  "verdura",
  "fruta",
  "especia",
  "hierba",
  "seco",
  "panaderia",
  "lacteo", // mantequilla/queso son sólidos; la leche cae como líquido vía LIQUID_KEYWORDS
]);

// Líquidos por categoría (l) — si nada en el nombre lo discrimina.
const LIQUID_CATEGORIES: ReadonlySet<ProductCategory> = new Set([
  "vinagre_aceite", // todo lo que cae acá es líquido por definición
]);

// Word-boundary match para single-word keywords; substring directo para
// multi-word. Evita falsos positivos del tipo "lata" matcheando dentro de
// "pelata" (Mandorla di Noto pelata).
function matchKeyword(haystack: string, keyword: string): boolean {
  if (keyword.includes(" ") || keyword.includes("-")) {
    return haystack.includes(keyword);
  }
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`).test(haystack);
}

export function defaultPurchaseUnit(
  category: ProductCategory,
  name: string,
): ProductUnit {
  const n = normalizeForMatch(name);

  // 1. Contables explícitos ganan sobre todo.
  for (const kw of COUNTABLE_KEYWORDS) {
    if (matchKeyword(n, kw)) return "unidad";
  }

  // 2. Líquidos por nombre (override de categoría — ej. "Leche de Almendra"
  //    está en lácteo pero es líquida).
  for (const kw of LIQUID_KEYWORDS) {
    if (matchKeyword(n, kw)) return "l";
  }

  // 3. Líquidos por categoría (vinagre_aceite).
  if (LIQUID_CATEGORIES.has(category)) return "l";

  // 4. Sólidos por categoría → kg.
  if (SOLID_CATEGORIES.has(category)) return "kg";

  // 5. Fallback: "otro" sin pista → unidad (más seguro que asumir kg).
  return "unidad";
}
