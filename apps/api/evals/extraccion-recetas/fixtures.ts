// Extraction bench fixtures. Each one has the text the model reads (mode B),
// recorded model outputs (mode A) and what the pipeline must return for any
// of them: the same canonical lines, sections and bank matches.
import type { MatchCandidate } from "@/lib/products/matching";

export type ExpectedLine = {
  /** contentJson line: canonical rawText + ", " + note. Compared case-insensitively. */
  display: string;
  /** Compared case-insensitively. */
  section: string | null;
  productId?: string | null;
  pesoCalculoG?: number | null;
  /** Product offered as a probable match for this line. */
  pending?: string;
};

export type Expectation = {
  /** Distinct sections in order of appearance. */
  sections: string[];
  lines: ExpectedLine[];
  /** Products that no line may be linked or offered to. */
  forbiddenProductIds?: string[];
};

export type Fixture = {
  id: string;
  description: string;
  /** Prompt used in mode B. */
  source: "chat" | "document";
  input: string;
  bank: MatchCandidate[];
  /** Recorded or hand-written model outputs, by variant name. */
  recorded: Record<string, unknown>;
  expected: Expectation;
};

const product = (id: string, name: string): MatchCandidate => ({ id, name, aliases: [] });

// ── 1. «Guardar como receta» from the assistant (production text) ──────────

const CALAMAR_ASSISTANT = `**Calamar embutido al pimentón**: el tubo de calamar funciona como tripa natural...
Rinde unas 16 raciones de 80 g (4 piezas).

**Tripa**
- 4 calamares de 350 g aprox. (tubos de 15–18 cm, sin roturas)

**Aceite de chorizo**
- 40 g AOVE
- 10 g pimentón de la Vera dulce
- 3 g pimentón de la Vera picante
- 6 g ajo en pasta
- 1 g orégano seco

**Farsa**
- 400 g rape limpio, muy frío (o merluza)
- 150 g gamba pelada, muy fría
- 120 g tentáculos de los calamares
- 35 g clara de huevo
- 100 g nata 35 %, fría
- 9 g sal fina

**Método**
1. Limpia los calamares sin abrir los tubos...
2. Calienta el aceite a 50 °C...`;

const CALAMAR_METHOD = ["Limpia los calamares sin abrir los tubos...", "Calienta el aceite a 50 °C..."];
const CALAMAR_BASE = { title: "Calamar embutido al pimentón", portions: 16, method: CALAMAR_METHOD, notes: "" };
const piece = (section: string, qty: number, unit: string | null, name: string, note: string | null = null, pieceWeightG: number | null = null) =>
  ({ section, qty, unit, name, note, pieceWeightG });

const CALAMAR: Fixture = {
  id: "chat-calamar",
  description: "Assistant recipe with bold preparations; GLM used to flatten them as «(aceite de chorizo)» suffixes.",
  source: "chat",
  input: `CHEF: Desarrolla la receta del calamar embutido al pimentón.\nASISTENTE: ${CALAMAR_ASSISTANT}`,
  bank: [product("p-aove", "AOVE"), product("p-chorizo", "Chorizo"), product("p-calamar", "Calamar"), product("p-rape", "Rape"), product("p-sal", "Sal fina")],
  recorded: {
    // The real production output: every preparation flattened into the line.
    flattened: {
      ...CALAMAR_BASE,
      ingredients: [
        "4 calamares de 350 g aprox. (tubos de 15–18 cm, sin roturas) (tripa)",
        "40 g AOVE (aceite de chorizo)",
        "10 g pimentón de la Vera dulce (aceite de chorizo)",
        "3 g pimentón de la Vera picante (aceite de chorizo)",
        "6 g ajo en pasta (aceite de chorizo)",
        "1 g orégano seco (aceite de chorizo)",
        "400 g rape limpio, muy frío (o merluza) (farsa)",
        "150 g gamba pelada, muy fría (farsa)",
        "120 g tentáculos de los calamares (farsa)",
        "35 g clara de huevo (farsa)",
        "100 g nata 35 %, fría (farsa)",
        "9 g sal fina (farsa)",
      ],
    },
    // The model copies the assistant's lines, headers and method included.
    markdown: {
      ...CALAMAR_BASE,
      ingredients: CALAMAR_ASSISTANT.split("\n").slice(3).filter((line) => line.trim()),
    },
    // What the extraction schema asks for.
    objects: {
      ...CALAMAR_BASE,
      ingredients: [
        piece("Tripa", 4, "unidad", "calamar", "tubos de 15–18 cm, sin roturas", 350),
        piece("Aceite de chorizo", 40, "g", "AOVE"),
        piece("Aceite de chorizo", 10, "g", "pimentón de la Vera dulce"),
        piece("Aceite de chorizo", 3, "g", "pimentón de la Vera picante"),
        piece("Aceite de chorizo", 6, "g", "ajo en pasta"),
        piece("Aceite de chorizo", 1, "g", "orégano seco"),
        piece("Farsa", 400, "g", "rape limpio", "muy frío, o merluza"),
        piece("Farsa", 150, "g", "gamba pelada", "muy fría"),
        piece("Farsa", 120, "g", "tentáculos de los calamares"),
        piece("Farsa", 35, "g", "clara de huevo"),
        piece("Farsa", 100, "g", "nata 35 %", "fría"),
        piece("Farsa", 9, "g", "sal fina"),
      ],
    },
  },
  expected: {
    sections: ["Tripa", "Aceite de chorizo", "Farsa"],
    forbiddenProductIds: ["p-chorizo"],
    lines: [
      { display: "4 ud calamar, tubos de 15–18 cm, sin roturas", section: "Tripa", productId: "p-calamar", pesoCalculoG: 350 },
      { display: "40 g AOVE", section: "Aceite de chorizo", productId: "p-aove" },
      { display: "10 g pimentón de la Vera dulce", section: "Aceite de chorizo", productId: null },
      { display: "3 g pimentón de la Vera picante", section: "Aceite de chorizo", productId: null },
      { display: "6 g ajo en pasta", section: "Aceite de chorizo", productId: null },
      { display: "1 g orégano seco", section: "Aceite de chorizo", productId: null },
      { display: "400 g rape limpio, muy frío, o merluza", section: "Farsa", productId: null, pending: "p-rape" },
      { display: "150 g gamba pelada, muy fría", section: "Farsa" },
      { display: "120 g tentáculos de los calamares", section: "Farsa", productId: null, pending: "p-calamar" },
      { display: "35 g clara de huevo", section: "Farsa" },
      { display: "100 g nata 35 %, fría", section: "Farsa" },
      { display: "9 g sal fina", section: "Farsa", productId: "p-sal" },
    ],
  },
};

// ── 2. Spanish document: tablespoons, cl, ½, ranges, «Para la salsa:» ─────

const ALBONDIGAS_BASE = {
  title: "Albóndigas de ternera en salsa",
  portions: 6,
  method: [
    "Mezcla la carne con el huevo, el pan rallado y la mitad del ajo; sala y forma bolas de 30 g.",
    "Dora las albóndigas y resérvalas.",
    "Sofríe la cebolla y el resto del ajo, añade la harina y moja con el vino.",
    "Agrega el caldo y el tomate, vuelve a poner las albóndigas y cuece 20 minutos.",
  ],
  notes: "",
};

const ALBONDIGAS: Fixture = {
  id: "documento-albondigas",
  description: "Recipe document with household measures, cl, ½, a range and a «Para la salsa:» block.",
  source: "document",
  input: [
    "ALBÓNDIGAS DE TERNERA EN SALSA",
    "Para 6 personas",
    "",
    "Ingredientes",
    "- 600 g de carne picada de ternera",
    "- 1 huevo",
    "- 2 cucharadas de pan rallado",
    "- 2-3 dientes de ajo, picados",
    "- ½ cebolla",
    "- Sal c/s",
    "- Pimienta al gusto",
    "",
    "Para la salsa:",
    "- 20 cl de vino blanco",
    "- 1/2 l de caldo de carne",
    "- 1 cucharada de harina",
    "- 200 g de tomate triturado",
    "",
    "Elaboración",
    ...ALBONDIGAS_BASE.method.map((step, i) => `${i + 1}. ${step}`),
  ].join("\n"),
  bank: [product("p-vino", "Vino blanco"), product("p-ternera", "Carne picada de ternera")],
  recorded: {
    copied: {
      ...ALBONDIGAS_BASE,
      ingredients: [
        "Ingredientes", "600 g de carne picada de ternera", "1 huevo", "2 cucharadas de pan rallado",
        "2-3 dientes de ajo, picados", "½ cebolla", "Sal c/s", "Pimienta al gusto", "Para la salsa:", "20 cl de vino blanco", "1/2 l de caldo de carne",
        "1 cucharada de harina", "200 g de tomate triturado",
      ],
    },
    objects: {
      ...ALBONDIGAS_BASE,
      ingredients: [
        { section: null, qty: 600, unit: "g", name: "carne picada de ternera", note: null, pieceWeightG: null },
        { section: null, qty: 1, unit: "unidad", name: "huevo", note: null, pieceWeightG: null },
        { section: null, qty: null, unit: null, name: "pan rallado", note: "2 cucharadas", pieceWeightG: null },
        { section: null, qty: 3, unit: "unidad", name: "diente de ajo", note: "2-3, picados", pieceWeightG: null },
        { section: null, qty: 0.5, unit: "unidad", name: "cebolla", note: null, pieceWeightG: null },
        { section: null, qty: null, unit: null, name: "sal", note: "c/s", pieceWeightG: null },
        { section: null, qty: null, unit: null, name: "pimienta", note: "al gusto", pieceWeightG: null },
        { section: "Salsa", qty: 200, unit: "ml", name: "vino blanco", note: null, pieceWeightG: null },
        { section: "Salsa", qty: 0.5, unit: "l", name: "caldo de carne", note: null, pieceWeightG: null },
        { section: "Salsa", qty: null, unit: null, name: "harina", note: "1 cucharada", pieceWeightG: null },
        { section: "Salsa", qty: 200, unit: "g", name: "tomate triturado", note: null, pieceWeightG: null },
      ],
    },
    // Objects that ignore the unit rule: loose quantities, cl and tablespoons.
    looseObjects: {
      ...ALBONDIGAS_BASE,
      ingredients: [
        { section: null, qty: "600", unit: "g", name: "carne picada de ternera" },
        { section: null, qty: 1, unit: "ud", name: "huevo" },
        { section: null, qty: 2, unit: "cucharadas", name: "pan rallado" },
        { section: null, qty: "2-3", unit: "unidad", name: "dientes de ajo", note: "picados" },
        { section: null, qty: "½", unit: "unidad", name: "cebolla" },
        { section: null, qty: null, unit: "c/s", name: "sal" },
        { section: null, qty: null, unit: null, name: "pimienta al gusto" },
        { section: "Para la salsa", qty: "20", unit: "cl", name: "vino blanco" },
        { section: "Para la salsa", qty: "1/2", unit: "l", name: "caldo de carne" },
        { section: "Para la salsa", qty: 1, unit: "cucharada", name: "harina" },
        { section: "Para la salsa", qty: 200, unit: "g", name: "tomate triturado" },
      ],
    },
  },
  expected: {
    sections: ["Salsa"],
    lines: [
      { display: "600 g carne picada de ternera", section: null, productId: "p-ternera" },
      { display: "1 ud huevo", section: null },
      { display: "pan rallado, 2 cucharadas", section: null },
      { display: "3 ud diente de ajo, 2-3, picados", section: null },
      { display: "0,5 ud cebolla", section: null },
      { display: "sal, c/s", section: null },
      { display: "pimienta, al gusto", section: null },
      { display: "200 ml vino blanco", section: "Salsa", productId: "p-vino" },
      { display: "0,5 l caldo de carne", section: "Salsa" },
      { display: "harina, 1 cucharada", section: "Salsa" },
      { display: "200 g tomate triturado", section: "Salsa" },
    ],
  },
};

// ── 3. Italian recipe with pieces ──────────────────────────────────────────

const ZUCCHINE_BASE = {
  title: "Zucchine ripiene alla ligure",
  portions: 4,
  method: [
    "Taglia le zucchine a metà e svuotale.",
    "Rosola la cipolla e l'aglio, aggiungi la carne e la polpa delle zucchine.",
    "Riempi le zucchine, coprile di besciamella e parmigiano e inforna 30 minuti a 180 °C.",
  ],
  notes: "",
};

const ZUCCHINE: Fixture = {
  id: "ricetta-zucchine",
  description: "Italian recipe: pieces with a weight each («da 200 g circa», «di 120 g l'uno»), q.b. and a «Per la besciamella:» block.",
  source: "document",
  input: [
    "Zucchine ripiene alla ligure",
    "Per 4 persone",
    "",
    "Ingredienti:",
    "- 4 zucchine da 200 g circa",
    "- 2 pomodori di 120 g l'uno",
    "- 1 cipolla",
    "- 150 g di carne macinata di manzo",
    "- 50 g di parmigiano grattugiato",
    "- 1 spicchio d'aglio",
    "- 2 cucchiai di olio extravergine",
    "- sale, q.b.",
    "Per la besciamella:",
    "- 500 ml di latte",
    "- 40 g di burro",
    "- 40 g di farina 00",
    "",
    "Procedimento",
    ...ZUCCHINE_BASE.method.map((step, i) => `${i + 1}. ${step}`),
  ].join("\n"),
  bank: [product("p-zucchina", "Zucchina"), product("p-burro", "Burro")],
  recorded: {
    copied: {
      ...ZUCCHINE_BASE,
      ingredients: [
        "Ingredienti:", "- 4 zucchine da 200 g circa", "- 2 pomodori di 120 g l'uno", "- 1 cipolla",
        "- 150 g di carne macinata di manzo", "- 50 g di parmigiano grattugiato", "- 1 spicchio d'aglio",
        "- 2 cucchiai di olio extravergine", "- sale, q.b.", "Per la besciamella:", "- 500 ml di latte",
        "- 40 g di burro", "- 40 g di farina 00",
      ],
    },
    objects: {
      ...ZUCCHINE_BASE,
      ingredients: [
        { section: null, qty: 4, unit: "unidad", name: "zucchina", note: null, pieceWeightG: 200 },
        { section: null, qty: 2, unit: "unidad", name: "pomodoro", note: null, pieceWeightG: 120 },
        { section: null, qty: 1, unit: "unidad", name: "cipolla", note: null, pieceWeightG: null },
        { section: null, qty: 150, unit: "g", name: "carne macinata di manzo", note: null, pieceWeightG: null },
        { section: null, qty: 50, unit: "g", name: "parmigiano grattugiato", note: null, pieceWeightG: null },
        { section: null, qty: 1, unit: "unidad", name: "spicchio d'aglio", note: null, pieceWeightG: null },
        { section: null, qty: null, unit: null, name: "olio extravergine", note: "2 cucchiai", pieceWeightG: null },
        { section: null, qty: null, unit: null, name: "sale", note: "q.b.", pieceWeightG: null },
        { section: "Besciamella", qty: 500, unit: "ml", name: "latte", note: null, pieceWeightG: null },
        { section: "Besciamella", qty: 40, unit: "g", name: "burro", note: null, pieceWeightG: null },
        { section: "Besciamella", qty: 40, unit: "g", name: "farina 00", note: null, pieceWeightG: null },
      ],
    },
  },
  expected: {
    sections: ["Besciamella"],
    lines: [
      { display: "4 ud zucchina", section: null, productId: "p-zucchina", pesoCalculoG: 200 },
      { display: "2 ud pomodoro", section: null, pesoCalculoG: 120 },
      { display: "1 ud cipolla", section: null, pesoCalculoG: null },
      { display: "150 g carne macinata di manzo", section: null },
      { display: "50 g parmigiano grattugiato", section: null },
      { display: "1 ud spicchio d'aglio", section: null },
      { display: "olio extravergine, 2 cucchiai", section: null },
      { display: "sale, q.b.", section: null },
      { display: "500 ml latte", section: "Besciamella" },
      { display: "40 g burro", section: "Besciamella", productId: "p-burro" },
      { display: "40 g farina 00", section: "Besciamella" },
    ],
  },
};

// ── 4. Photo-like OCR text: name first, bullets, uppercase headers ─────────

const BIZCOCHO_BASE = {
  title: "Bizcocho relleno de crema",
  portions: null,
  method: ["Bate los huevos con el azúcar hasta que blanqueen.", "Añade la leche, la mantequilla y la harina; hornea 40 min a 180 °C.", "Rellena con la crema aromatizada con el ron."],
  notes: "",
};

const BIZCOCHO: Fixture = {
  id: "foto-ocr-bizcocho",
  description: "Text as OCR reads a photographed card: bullets, name before quantity, glued units, uppercase headers.",
  source: "document",
  input: [
    "BIZCOCHO RELLENO DE CREMA",
    "INGREDIENTES:",
    "• Harina de trigo 500 g",
    "• Azúcar 1/2 kg",
    "• 3 huevos",
    "• Leche 250ml",
    "• Mantequilla 100 gr.",
    "• 1 pizca de sal",
    "RELLENO:",
    "• Crema pastelera 400 g",
    "• 2 cucharadas de ron",
    "PREPARACIÓN: Bate los huevos con el azúcar hasta que blanqueen. Añade la leche, la mantequilla y la harina;",
    "hornea 40 min a 180 °C. Rellena con la crema aromatizada con el ron.",
  ].join("\n"),
  bank: [product("p-harina", "Harina de trigo"), product("p-huevo", "Huevo")],
  recorded: {
    copied: {
      ...BIZCOCHO_BASE,
      ingredients: [
        "INGREDIENTES:", "• Harina de trigo 500 g", "• Azúcar 1/2 kg", "• 3 huevos", "• Leche 250ml",
        "• Mantequilla 100 gr.", "• 1 pizca de sal", "RELLENO:", "• Crema pastelera 400 g", "• 2 cucharadas de ron",
      ],
    },
    objects: {
      ...BIZCOCHO_BASE,
      ingredients: [
        { section: null, qty: 500, unit: "g", name: "harina de trigo", note: null, pieceWeightG: null },
        { section: null, qty: 0.5, unit: "kg", name: "azúcar", note: null, pieceWeightG: null },
        { section: null, qty: 3, unit: "unidad", name: "huevo", note: null, pieceWeightG: null },
        { section: null, qty: 250, unit: "ml", name: "leche", note: null, pieceWeightG: null },
        { section: null, qty: 100, unit: "g", name: "mantequilla", note: null, pieceWeightG: null },
        { section: null, qty: null, unit: null, name: "sal", note: "1 pizca", pieceWeightG: null },
        { section: "Relleno", qty: 400, unit: "g", name: "crema pastelera", note: null, pieceWeightG: null },
        { section: "Relleno", qty: null, unit: null, name: "ron", note: "2 cucharadas", pieceWeightG: null },
      ],
    },
  },
  expected: {
    sections: ["Relleno"],
    lines: [
      { display: "500 g harina de trigo", section: null, productId: "p-harina" },
      { display: "0,5 kg azúcar", section: null },
      { display: "3 ud huevo", section: null, productId: "p-huevo" },
      { display: "250 ml leche", section: null },
      { display: "100 g mantequilla", section: null },
      { display: "sal, 1 pizca", section: null },
      { display: "400 g crema pastelera", section: "Relleno" },
      { display: "ron, 2 cucharadas", section: "Relleno" },
    ],
  },
};

// ── 5. Italian recipe: q.b., packaging, Italian plurals, headers without colon ──

const TORTA_BASE = {
  title: "Torta salata di melanzane",
  portions: 6,
  method: [
    "Griglia le melanzane a fette.",
    "Sbatti le uova con il latte, aggiungi la farina, il lievito, il parmigiano, il sale e il pepe.",
    "Alterna l'impasto e le melanzane nello stampo e inforna 35 minuti a 180 °C.",
  ],
  notes: "",
};
const TORTA_STEPS = TORTA_BASE.method.map((step, i) => `${i + 1}. ${step}`);

const TORTA: Fixture = {
  id: "ricetta-torta-salata",
  description: "Italian recipe: «Sale q.b.», «a piacere», «1 bustina di lievito», uova/melanzane and headers without a colon.",
  source: "document",
  input: [
    "Torta salata di melanzane",
    "Per 6 persone",
    "",
    "Ingredienti",
    "- 2 melanzane",
    "- 2 uova",
    "- 250 g di farina 00",
    "- 100 ml di latte",
    "- 1 bustina di lievito istantaneo",
    "- 50 g di parmigiano grattugiato",
    "- Sale q.b.",
    "- Pepe nero a piacere",
    "",
    "Procedimento",
    ...TORTA_STEPS,
  ].join("\n"),
  bank: [product("p-melanzana", "Melanzana"), product("p-uovo", "Uovo")],
  recorded: {
    // The model copies the document, headers and method included.
    copied: {
      ...TORTA_BASE,
      ingredients: [
        "Ingredienti", "- 2 melanzane", "- 2 uova", "- 250 g di farina 00", "- 100 ml di latte",
        "- 1 bustina di lievito istantaneo", "- 50 g di parmigiano grattugiato", "- Sale q.b.", "- Pepe nero a piacere",
        "Procedimento", ...TORTA_STEPS,
      ],
    },
    objects: {
      ...TORTA_BASE,
      ingredients: [
        { section: null, qty: 2, unit: "unidad", name: "melanzana", note: null, pieceWeightG: null },
        { section: null, qty: 2, unit: "unidad", name: "uovo", note: null, pieceWeightG: null },
        { section: null, qty: 250, unit: "g", name: "farina 00", note: null, pieceWeightG: null },
        { section: null, qty: 100, unit: "ml", name: "latte", note: null, pieceWeightG: null },
        { section: null, qty: null, unit: null, name: "lievito istantaneo", note: "1 bustina", pieceWeightG: null },
        { section: null, qty: 50, unit: "g", name: "parmigiano grattugiato", note: null, pieceWeightG: null },
        { section: null, qty: null, unit: null, name: "sale", note: "q.b.", pieceWeightG: null },
        { section: null, qty: null, unit: null, name: "pepe nero", note: "a piacere", pieceWeightG: null },
      ],
    },
    // Objects that keep the plurals and put the packaging or «q.b.» in the unit or the name.
    looseObjects: {
      ...TORTA_BASE,
      ingredients: [
        { section: null, qty: 2, unit: "unidad", name: "melanzane" },
        { section: null, qty: 2, unit: null, name: "uova" },
        { section: null, qty: 250, unit: "g", name: "farina 00" },
        { section: null, qty: 100, unit: "ml", name: "latte" },
        { section: null, qty: 1, unit: "bustina", name: "lievito istantaneo" },
        { section: null, qty: 50, unit: "g", name: "parmigiano grattugiato" },
        { section: null, qty: null, unit: "q.b.", name: "sale" },
        { section: null, qty: null, unit: null, name: "pepe nero a piacere" },
      ],
    },
  },
  expected: {
    sections: [],
    lines: [
      { display: "2 ud melanzana", section: null, productId: "p-melanzana" },
      { display: "2 ud uovo", section: null, productId: "p-uovo" },
      { display: "250 g farina 00", section: null },
      { display: "100 ml latte", section: null },
      { display: "lievito istantaneo, 1 bustina", section: null },
      { display: "50 g parmigiano grattugiato", section: null },
      { display: "sale, q.b.", section: null },
      { display: "pepe nero, a piacere", section: null },
    ],
  },
};

export const FIXTURES: readonly Fixture[] = [CALAMAR, ALBONDIGAS, ZUCCHINE, BIZCOCHO, TORTA];
