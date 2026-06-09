// 14 alérgenos del Reg. EU 1169/2011 Anexo II.
//
// El alérgeno vive en el Product del banco (1 alérgeno por producto, o
// ninguno — aceite de oliva). El plato calcula sus alérgenos como unión de
// los alérgenos de sus productos enlazados + manualAllergens. El helper de
// cómputo vive en `apps/api/lib/products/allergens-recipe.ts` para no meter
// dependencias de cómputo en shared.
//
// `suggestAllergen` se usa al crear/editar un producto en el banco: mientras
// el chef tipea el nombre, se sugiere el alérgeno por keyword matching. Vive
// en shared (no api/lib) porque el mobile lo llama in-process en cada
// keypress — server-side sería un roundtrip por tecla.
//
// Patrón espejo de `categorizeFromName` (apps/api/lib/products/defaults.ts):
// word-boundary regex + cache + multi-palabra substring + normalizeForMatch.

import { z } from "zod";
import { normalizeForMatch } from "./normalize";

// Espejo del enum "Allergen" en Prisma. Mantener orden con ALLERGEN_ORDER abajo.
export type Allergen =
  | "gluten"
  | "crustaceans"
  | "eggs"
  | "fish"
  | "peanuts"
  | "soy"
  | "milk"
  | "tree_nuts"
  | "celery"
  | "mustard"
  | "sesame"
  | "sulphites"
  | "lupin"
  | "molluscs";

// Orden oficial Reg. EU 1169/2011. Lo usa el helper de cómputo para
// devolver la unión de alérgenos en orden estable (leyenda del PDF + iconos
// no oscilan según el orden de carga de los ingredientes).
export const ALLERGEN_ORDER: readonly Allergen[] = [
  "gluten",
  "crustaceans",
  "eggs",
  "fish",
  "peanuts",
  "soy",
  "milk",
  "tree_nuts",
  "celery",
  "mustard",
  "sesame",
  "sulphites",
  "lupin",
  "molluscs",
] as const;

export const AllergenSchema = z.enum([
  "gluten",
  "crustaceans",
  "eggs",
  "fish",
  "peanuts",
  "soy",
  "milk",
  "tree_nuts",
  "celery",
  "mustard",
  "sesame",
  "sulphites",
  "lupin",
  "molluscs",
]);

// ───────── Diccionario nombre → alérgeno (v2 — siembra real Andy) ─────────
//
// Lista cargada de `diccionario_alergenos_v2.md`. Afinada con productos
// reales del banco de Andy + 3 decisiones cerradas:
//   - mirin/shio-koji puros de arroz → no gluten.
//   - wasabi sin mostaza añadida → no mostaza.
//   - todos los vinagres (incluido de arroz) → sulfitos (lado seguro).
//
// **Orden crítico — anti-falso-positivo:** los alérgenos vegetales/planta
// (tree_nuts, gluten, soy, peanuts) van ANTES que milk. Razón: nombres como
// "leche de almendra", "latte di mandorla", "almond milk", "soy milk",
// "oat milk" tienen tanto "leche/latte/milk" como la planta. El matcher
// devuelve el PRIMER match, así que tree_nuts gana sobre milk. Esto evita el
// falso positivo más peligroso (que un alérgico a la leche tome leche de
// almendra creyendo que es la suya).
//
// Reglas heredadas (de CATEGORY_KEYWORDS en defaults.ts):
//   - Single-word match por word-boundary regex.
//   - Multi-word match por substring (ya son específicas).
//   - Primer match gana — orden dentro de cada grupo no importa, orden ENTRE
//     grupos sí.
//   - Normalización: lowercase + sin acentos (normalizeForMatch).
export const ALLERGEN_KEYWORDS: ReadonlyArray<{
  allergen: Allergen;
  keywords: ReadonlyArray<string>;
}> = [
  // ───── Plantas/vegetales primero (anti-falso-positivo "leche de X") ─────
  {
    allergen: "tree_nuts",
    keywords: [
      "noce", "noci", "nuez", "nueces", "walnut",
      "mandorla", "mandorle", "mandorla di noto",
      "almendra", "almendras", "almendra marcona", "almendras marcona",
      "almond", "almond milk", "leche de almendra", "latte di mandorla",
      "nocciola", "nocciole", "avellana", "avellanas", "hazelnut",
      "pistacchio", "pistacho", "pistachio",
      "pinolo", "pinoli", "pinon", "pinones", "pine nut",
      "anacardo", "cashew", "macadamia", "pecan",
      "castagna", "castaña", "castagne", "castañas",
      "pralina", "praline", "marzapane", "frangipane", "gianduia",
    ],
  },
  {
    allergen: "gluten",
    keywords: [
      "glutine", "gluten",
      "grano", "trigo", "wheat",
      "farina", "harina", "flour",
      "frumento",
      "pane", "pan", "bread", "pane carasau", "carasau",
      "pasta", "spaghetti", "tagliatelle", "tagliolini",
      "fettuccine", "pappardelle",
      "pangrattato", "pan rallato", "panko",
      "semola", "semolina",
      "farro", "espelta", "spelt",
      "orzo", "cebada", "barley",
      "segale", "centeno", "rye",
      "cous cous", "couscous", "bulgur",
      "seitan",
      "birra", "cerveza", "beer",
      "tempura", "impanato", "empanado", "rebozado",
      "crostini", "focaccia", "grissini", "brioche",
      "malt", "malta",
      // Avena → gluten (regla Andy: "leche de avena" debe marcar gluten).
      "avena", "oat", "oats", "oat milk", "leche de avena", "latte di avena",
    ],
  },
  {
    allergen: "soy",
    keywords: [
      "soia", "soja", "soy", "soya",
      "edamame", "tofu", "tempeh", "miso",
      "salsa di soia", "salsa de soja", "soy sauce", "shoyu", "tamari",
      "lecitina di soia", "lecitina de soja", "soy lecithin",
      "soy milk", "latte di soia", "leche de soja",
      "germogli di soia",
    ],
  },
  {
    allergen: "peanuts",
    keywords: [
      "arachide", "arachidi",
      "cacahuete", "cacahuetes",
      "mani",
      "peanut", "peanuts", "groundnut",
      "burro di arachidi", "peanut butter",
    ],
  },

  // ───── Resto del Reg. EU 1169 ─────
  {
    allergen: "crustaceans",
    keywords: [
      "scampo", "scampi",
      "gambero", "gamberi",
      "gamberi 20/30", "gamberi rossi di mazara", "gambero rosso",
      "gamberetto", "gamberetti",
      "gambas", "gamba",
      "camaron", "camarones",
      "langostino", "langostinos",
      "carabinero", "carabineros",
      "mazzancolla", "mazzancolle",
      "astice", "aragosta",
      "langosta", "bogavante",
      "granchio", "granchi", "cangrejo", "cangrejos",
      "cigala", "cigalas",
      "canocchia", "cicala di mare",
      "krill",
      "prawn", "prawns", "shrimp", "shrimps", "lobster", "crab",
      "langoustine", "crayfish",
    ],
  },
  {
    allergen: "eggs",
    keywords: [
      "uovo", "uova",
      "huevo", "huevos",
      "egg", "eggs", "yolk",
      "tuorlo", "yema", "yemas",
      "albume", "clara", "claras",
      "maionese", "mayonesa", "mayonnaise",
      "meringa", "meringhe", "merengue", "merengues",
      "frittata",
      "pasta all'uovo",
      "zabaione",
      "crema pasticcera", "crema pastelera",
    ],
  },
  {
    allergen: "fish",
    keywords: [
      "pesce", "pescado", "fish",
      "branzino", "spigola", "lubina",
      "orata", "dorada",
      "rombo", "rodaballo",
      "sogliola", "lenguado",
      "merluzzo", "baccala", "bacalao",
      "tonno", "atun",
      // Bonito seco = katsuobushi (decisión Andy 26-05-26). Marca pescado.
      "bonito",
      "salmone", "salmon",
      "ricciola", "lomo de ricciola", "seriola",
      "ombrina", "lomo de ombrina", "corvina",
      "sgombro",
      "sardina", "sardine", "sarde",
      "alice", "alici", "acciuga", "acciughe", "anchoa", "anchoas",
      "triglia",
      "rana pescatrice", "coda di rospo",
      "cernia", "mero",
      "pesce spada", "pez espada",
      "trota", "anguilla",
      // Condimentos/esencias — agresivo (decisión Andy):
      "colatura", "colatura di alici",
      "garum",
      "bottarga", "botarga", "botarga de mujol", "bottarga di muggine",
      "dashi", "katsuobushi", "niboshi", "hondashi",
      "fish sauce", "nam pla",
      "surimi",
      "caviale", "caviar",
      "uova di pesce", "huevas",
    ],
  },
  {
    allergen: "milk",
    keywords: [
      "latte", "leche", "milk",
      "latte intero fresco", "latte intero",
      "burro", "mantequilla", "butter",
      "burro chiarificato", "ghee",
      // Manteca clarificada (decisión Andy 26-05-26): mantiene caseína =
      // alérgeno EU 1169 aunque casi no tenga lactosa. Multi-word: matchea
      // SOLO el string exacto, así "manteca de cacao" y "manteca de cerdo"
      // (que NO son lácteo) NO se enganchan.
      "manteca clarificada", "manteca chiarificata",
      "panna", "nata", "cream",
      "formaggio", "queso", "cheese",
      "parmigiano", "grana", "grana padano",
      "pecorino", "pecorino romano",
      "mozzarella", "burrata", "stracciatella",
      "ricotta", "mascarpone",
      "gorgonzola", "taleggio", "fontina",
      "yogurt", "yogur", "kefir",
      "latticini",
      "siero di latte", "suero", "whey",
      "caseina", "casein",
    ],
  },
  {
    allergen: "celery",
    keywords: [
      "sedano", "apio", "celery",
      "sedano 1 costa", "tallo de apio",
      "sedano rapa", "apionabo", "celeriac",
      "sale di sedano",
    ],
  },
  {
    allergen: "mustard",
    keywords: [
      "senape", "mostaza", "mustard",
      "semi di senape",
      "dijon", "mostaza de dijon",
    ],
  },
  {
    allergen: "sesame",
    keywords: [
      "sesamo", "sesame", "ajonjoli",
      "semi di sesamo", "semillas de sesamo",
      "tahini", "tahina",
      "gomasio", "gomashio",
      "olio di sesamo", "aceite de sesamo",
    ],
  },
  {
    allergen: "sulphites",
    keywords: [
      "solfiti", "sulfito", "sulfitos", "solfito",
      "sulphite", "sulphites", "sulfite",
      "vino", "vino bianco", "vino bianco secco", "vino rosso",
      "vino blanco", "vino tinto", "wine",
      "vinagre", "aceto", "vinegar",
      "vinagre de jerez", "vinagre de vino tinto", "vinagre de arroz",
      "rice vinegar", "aceto di riso",
      "aceto balsamico", "vinagre balsamico",
      "marsala",
      "uva passa", "uvetta", "uva pasa", "raisin",
      "mosto",
    ],
  },
  {
    allergen: "lupin",
    keywords: [
      "lupino", "lupini", "altramuz", "altramuces", "lupin",
      "farina di lupino",
    ],
  },
  {
    allergen: "molluscs",
    keywords: [
      "vongola", "vongole", "vongole ceraci",
      "cozza", "cozze", "mejillon", "mejillones",
      "almeja", "almejas",
      "ostrica", "ostriche", "ostra", "ostras",
      "capasanta", "capesante", "vieira", "vieiras",
      "calamaro", "calamari", "calamar", "calamares",
      "totano", "totani",
      "seppia", "seppie", "sepia",
      "polpo", "pulpo",
      "moscardino", "moscardini",
      "garusoli", "murice",
      "telline", "fasolari",
      "cannolicchi", "navaja", "navajas",
      "abalone",
      "clam", "clams", "mussel", "mussels", "oyster", "oysters",
      "scallop", "scallops", "squid", "cuttlefish", "octopus", "whelk",
    ],
  },
];

// Escape regex metachars (igual que defaults.ts). Mantenemos keywords sin
// puntos/paréntesis para simplificar.
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Cache de regex compilados. Las keywords son constantes; comprimir el costo
// de RegExp() es valioso en mobile cuando el usuario tipea el nombre.
const SINGLE_WORD_CACHE = new Map<string, RegExp>();
function singleWordRegex(kw: string): RegExp {
  const cached = SINGLE_WORD_CACHE.get(kw);
  if (cached) return cached;
  const re = new RegExp(`\\b${escapeRegex(kw)}\\b`);
  SINGLE_WORD_CACHE.set(kw, re);
  return re;
}

function matchesKeyword(haystack: string, keyword: string): boolean {
  if (keyword.includes(" ")) {
    // Multi-palabra: substring directo (ya son lo bastante específicas como
    // para no necesitar boundary).
    return haystack.includes(keyword);
  }
  return singleWordRegex(keyword).test(haystack);
}

// Sugiere el alérgeno para un nombre de producto. Devuelve null si nada
// matchea — el caller (UI de Fase 2) NO marca el producto solo: pide a Andy
// que confirme la sugerencia con un tap.
export function suggestAllergen(name: string): Allergen | null {
  const normalized = normalizeForMatch(name);
  if (!normalized) return null;
  for (const group of ALLERGEN_KEYWORDS) {
    for (const kw of group.keywords) {
      if (matchesKeyword(normalized, kw)) return group.allergen;
    }
  }
  return null;
}
