import { describe, expect, it } from "vitest";
import { parseIngredient } from "./parser";
import {
  EXTRACTION_INGREDIENT_JSON_SCHEMA,
  INGREDIENT_RULES,
  STANDARD_UNITS,
  StandardIngredientSchema,
  displayLine,
  formatIngredientLine,
  renderRules,
  standardizeIngredient,
  standardizeIngredientLine,
  standardizeIngredientLines,
  type StandardIngredient,
} from "./ingredient-standard";

const ing = (over: Partial<StandardIngredient> & { name: string }): StandardIngredient => ({
  section: null, qty: null, unit: null, note: null, pieceWeightG: null, ...over,
});

const line = (text: string, knownSections?: string[]) => standardizeIngredientLine(text, { knownSections });

// Real production recipe (Kokoo calamar), as the chat writes it.
const SECTIONED = [
  "**Tripa**",
  "- 4 calamares de 350 g aprox. (tubos de 15–18 cm, sin roturas)",
  "**Aceite de chorizo**",
  "- 40 g AOVE",
  "- 10 g pimentón de la Vera dulce",
  "- 3 g pimentón de la Vera picante",
  "- 6 g ajo en pasta",
  "- 1 g orégano seco",
  "**Farsa**",
  "- 400 g rape limpio, muy frío (o merluza)",
  "- 150 g gamba pelada, muy fría",
  "- 120 g tentáculos de los calamares",
  "- 35 g clara de huevo",
  "- 100 g nata 35 %, fría",
  "- 9 g sal fina",
];

// The same recipe after the AI flattened the sections into the lines.
const FLAT = [
  "4 calamares de 350 g aprox. (tubos de 15–18 cm, sin roturas) (tripa)",
  "40 g AOVE (aceite de chorizo)",
  "10 g pimentón de la Vera dulce (aceite de chorizo)",
  "3 g pimentón de la Vera picante (aceite de chorizo)",
  "6 g ajo en pasta (aceite de chorizo)",
  "1 g orégano seco (Aceite de Chorizo)",
  "400 g rape limpio, muy frío (o merluza) (farsa)",
  "150 g gamba pelada, muy fría (farsa)",
  "120 g tentáculos de los calamares (farsa)",
  "35 g clara de huevo (farsa)",
  "100 g nata 35 %, fría (farsa)",
  "9 g sal fina (farsa)",
];

const EXPECTED: StandardIngredient[] = [
  ing({ section: "Tripa", qty: 4, unit: "unidad", name: "calamar", note: "tubos de 15–18 cm, sin roturas", pieceWeightG: 350 }),
  ing({ section: "Aceite de chorizo", qty: 40, unit: "g", name: "AOVE" }),
  ing({ section: "Aceite de chorizo", qty: 10, unit: "g", name: "pimentón de la Vera dulce" }),
  ing({ section: "Aceite de chorizo", qty: 3, unit: "g", name: "pimentón de la Vera picante" }),
  ing({ section: "Aceite de chorizo", qty: 6, unit: "g", name: "ajo en pasta" }),
  ing({ section: "Aceite de chorizo", qty: 1, unit: "g", name: "orégano seco" }),
  ing({ section: "Farsa", qty: 400, unit: "g", name: "rape limpio", note: "muy frío, o merluza" }),
  ing({ section: "Farsa", qty: 150, unit: "g", name: "gamba pelada", note: "muy fría" }),
  ing({ section: "Farsa", qty: 120, unit: "g", name: "tentáculos de los calamares" }),
  ing({ section: "Farsa", qty: 35, unit: "g", name: "clara de huevo" }),
  ing({ section: "Farsa", qty: 100, unit: "g", name: "nata 35 %", note: "fría" }),
  ing({ section: "Farsa", qty: 9, unit: "g", name: "sal fina" }),
];

describe("production recipe", () => {
  it("reads the sectioned list", () => {
    const result = standardizeIngredientLines(SECTIONED);
    expect(result.ingredients).toEqual(EXPECTED);
    expect(result.flags).toEqual(["markdown", "note_split", "piece_weight"]);
  });

  it("reads the flattened lines with known sections", () => {
    const knownSections = ["tripa", "aceite de chorizo", "farsa"];
    expect(FLAT.map((l) => line(l, knownSections).ingredient)).toEqual(EXPECTED);
  });

  it("keeps an unknown parenthetical in the note", () => {
    expect(line("40 g AOVE (aceite de chorizo)").ingredient).toEqual(
      ing({ qty: 40, unit: "g", name: "AOVE", note: "aceite de chorizo" }),
    );
  });

  it("is stable when the display line is standardized again", () => {
    for (const expected of EXPECTED) {
      expect(line(displayLine(expected)).ingredient).toEqual({ ...expected, section: null, pieceWeightG: null });
    }
  });

  it("produces schema-valid ingredients", () => {
    for (const expected of EXPECTED) expect(StandardIngredientSchema.safeParse(expected).success).toBe(true);
  });
});

describe("standardizeIngredientLine", () => {
  it.each([
    ["20 cl ron", ing({ qty: 200, unit: "ml", name: "ron" }), ["cl_dl"]],
    ["1 cucharada de aceite", ing({ name: "aceite", note: "1 cucharada" }), ["household"]],
    ["½ limón", ing({ qty: 0.5, unit: "unidad", name: "limón" }), ["fraction"]],
    ["2-3 dientes de ajo", ing({ qty: 3, unit: "unidad", name: "diente de ajo", note: "2-3" }), ["range"]],
    ["15–18 g sal", ing({ qty: 18, unit: "g", name: "sal", note: "15–18" }), ["range"]],
    ["Sal fina, 8 g", ing({ qty: 8, unit: "g", name: "Sal fina" }), []],
    ["Harina 200 g", ing({ qty: 200, unit: "g", name: "Harina" }), []],
    ["Harina 00, 200 g", ing({ qty: 200, unit: "g", name: "Harina 00" }), []],
    ["Harina 00", ing({ name: "Harina 00" }), []],
    ["Ron añejo, 5 cl", ing({ qty: 50, unit: "ml", name: "Ron añejo" }), ["cl_dl"]],
    ["sal c/s", ing({ name: "sal", note: "c/s" }), ["household"]],
    ["Aceite, 2 cucharadas", ing({ name: "Aceite", note: "2 cucharadas" }), ["household"]],
    ["aceite 1 cucharada", ing({ name: "aceite", note: "1 cucharada" }), ["household"]],
    ["`1400 g celeriac`", ing({ qty: 1400, unit: "g", name: "celeriac" }), ["markdown"]],
    ["- **200 g** harina", ing({ qty: 200, unit: "g", name: "harina" }), ["markdown"]],
    ["* 1 kg patata", ing({ qty: 1, unit: "kg", name: "patata" }), ["markdown"]],
    ["3. ½ limone", ing({ qty: 0.5, unit: "unidad", name: "limone" }), ["markdown", "fraction"]],
    ["1.5 kg harina", ing({ qty: 1.5, unit: "kg", name: "harina" }), []],
    ["1 1/2 kg patata", ing({ qty: 1.5, unit: "kg", name: "patata" }), ["fraction"]],
    ["0,5 l leche", ing({ qty: 0.5, unit: "l", name: "leche" }), []],
    ["8 oz harina", ing({ name: "harina", note: "8 oz" }), ["unmeasured"]],
    ["Mantequilla, 2 lb", ing({ name: "Mantequilla", note: "2 lb" }), ["unmeasured"]],
    ["400 g rape limpio, muy frío (o merluza)", ing({ qty: 400, unit: "g", name: "rape limpio", note: "muy frío, o merluza" }), ["note_split"]],
    ["100 g nata 35 %, fría", ing({ qty: 100, unit: "g", name: "nata 35 %", note: "fría" }), ["note_split"]],
  ] as const)("%s", (text, expected, flags) => {
    const result = line(text);
    expect(result.ingredient).toEqual(expected);
    expect(result.flags).toEqual(flags);
  });

  // "To taste" expressions: no quantity, the product name clean, the expression in the note.
  it.each([
    ["Sale q.b.", "Sale", "q.b."],
    ["sale qb", "sale", "qb"],
    ["sale, q.b.", "sale", "q.b."],
    ["Sale QB", "Sale", "QB"],
    ["sale quanto basta", "sale", "quanto basta"],
    ["Pimienta negra al gusto", "Pimienta negra", "al gusto"],
    ["sal a gusto", "sal", "a gusto"],
    ["pepe nero a piacere", "pepe nero", "a piacere"],
    ["sal c.s.", "sal", "c.s."],
    ["sal cs", "sal", "cs"],
    ["- Pimienta al gusto, recién molida", "Pimienta", "al gusto, recién molida"],
  ] as const)("keeps %s unmeasured", (text, name, note) => {
    const result = line(text);
    expect(result.ingredient).toEqual(ing({ name, note }));
    expect(result.flags).toContain("household");
  });

  // Packaging has no standard weight: the chef completes the quantity.
  it.each([
    ["1 sobre de levadura", "levadura", "1 sobre"],
    ["1 bustina di lievito", "lievito", "1 bustina"],
    ["2 latas de tomate", "tomate", "2 latas"],
    ["1 lata tomate triturado", "tomate triturado", "1 lata"],
    ["1 bote de garbanzos cocidos", "garbanzos cocidos", "1 bote"],
    ["1 vasetto di yogurt", "yogurt", "1 vasetto"],
    ["1 rametto di rosmarino", "rosmarino", "1 rametto"],
    ["1 manojo de perejil", "perejil", "1 manojo"],
    ["2 mazzetti di basilico", "basilico", "2 mazzetti"],
    ["Levadura, 1 sobre", "Levadura", "1 sobre"],
    ["Levadura 1 sobre", "Levadura", "1 sobre"],
  ] as const)("keeps the packaging in %s as a note", (text, name, note) => {
    const result = line(text);
    expect(result.ingredient).toEqual(ing({ name, note }));
    expect(result.flags).toEqual(["unmeasured"]);
  });

  it.each([
    ["4 huevos", 4, "huevo"],
    ["2 cebollas", 2, "cebolla"],
    ["3 dientes de ajo", 3, "diente de ajo"],
  ] as const)("keeps %s as pieces", (text, qty, name) => {
    expect(line(text).ingredient).toEqual(ing({ qty, unit: "unidad", name }));
  });


  it.each([
    ["4 calamares de 350 g aprox. (tubos de 15–18 cm, sin roturas)", 350, "calamar", "tubos de 15–18 cm, sin roturas"],
    ["4 calamares (350 g c/u)", 350, "calamar", null],
    ["2 tomates de 200 g", 200, "tomate", null],
    ["3 huevos, 60 g cada uno", 60, "huevo", null],
    ["2 calamares de 1,2 kg", 1200, "calamar", null],
  ] as const)("reads the piece weight in %s", (text, weight, name, note) => {
    const result = line(text);
    expect(result.ingredient).toMatchObject({ unit: "unidad", name, note, pieceWeightG: weight });
    expect(result.flags).toContain("piece_weight");
  });

  it("does not read a piece weight on a measured line", () => {
    expect(line("400 g rape de 2 kg").ingredient).toEqual(ing({ qty: 400, unit: "g", name: "rape de 2 kg" }));
  });

  it.each([
    ["6 tomates", "tomate"],
    ["12 huevos camperos", "huevo campero"],
    ["3 limones", "limón"],
    ["2 dientes de ajo", "diente de ajo"],
    ["2 liebres", "liebre"],
    ["4 nueces", "nuez"],
    ["2 calabacines", "calabacín"],
    ["4 panes de hamburguesa", "pan de hamburguesa"],
    ["4 kiwis", "kiwi"],
    ["4 ud kiwi", "kiwi"],
    ["4 pomodori", "pomodoro"],
    ["3 limoni", "limone"],
    ["2 cipolle", "cipolla"],
    ["1 tomate", "tomate"],
    ["2 eggs", "eggs"],
  ] as const)("singularizes the pieces in %s", (text, name) => {
    expect(line(text).ingredient).toMatchObject({ unit: "unidad", name });
  });

  it.each([
    ["2 melanzane", "melanzana"],
    ["2 uova", "uovo"],
    ["3 limoni", "limone"],
    ["4 pomodori", "pomodoro"],
    ["2 cipolle", "cipolla"],
    ["4 zucchine", "zucchina"],
    ["1 melanzana", "melanzana"],
  ] as const)("singularizes the Italian pieces in %s", (text, name) => {
    expect(line(text).ingredient).toMatchObject({ unit: "unidad", name });
  });

  it("does not singularize measured names", () => {
    expect(line("200 g melanzane").ingredient.name).toBe("melanzane");
    expect(line("200 g tomates cherry").ingredient.name).toBe("tomates cherry");
  });

  it("matches known sections without case or accents", () => {
    expect(line("40 g AOVE (ACEITE DE CHORIZO)", ["Aceite de chorizo"]).ingredient).toEqual(
      ing({ section: "Aceite de chorizo", qty: 40, unit: "g", name: "AOVE" }),
    );
    expect(line("1 l caldo (coccion)", ["Cocción"]).ingredient.section).toBe("Cocción");
  });
});

describe("formatIngredientLine / displayLine", () => {
  it("writes the canonical rawText", () => {
    expect(formatIngredientLine(ing({ qty: 400, unit: "g", name: "rape limpio" }))).toBe("400 g rape limpio");
    expect(formatIngredientLine(ing({ qty: 1.5, unit: "kg", name: "harina" }))).toBe("1,5 kg harina");
    expect(formatIngredientLine(ing({ qty: 2.1, unit: "l", name: "leche" }))).toBe("2,1 l leche");
    expect(formatIngredientLine(ing({ qty: 0.3333, unit: "kg", name: "sal" }))).toBe("0,333 kg sal");
    expect(formatIngredientLine(ing({ qty: 4, unit: "unidad", name: "calamar", pieceWeightG: 350 }))).toBe("4 ud calamar");
    expect(formatIngredientLine(ing({ name: "aceite", note: "1 cucharada" }))).toBe("aceite");
  });

  it("appends the note to the display line", () => {
    expect(displayLine(ing({ qty: 400, unit: "g", name: "rape limpio", note: "muy frío" }))).toBe("400 g rape limpio, muy frío");
    expect(displayLine(ing({ name: "aceite", note: "1 cucharada" }))).toBe("aceite, 1 cucharada");
    expect(displayLine(ing({ qty: 9, unit: "g", name: "sal fina" }))).toBe("9 g sal fina");
  });

  // Property-style: the parser reads back exactly what the formatter wrote.
  it("round-trips through parseIngredient", () => {
    const names = [
      "rape limpio", "calamar", "AOVE", "pimentón de la Vera dulce", "nata 35 %", "harina (00)",
      "tentáculos de los calamares", "limón", "Salsa casera, mediterránea", "ñora", "guanciale", "olive oil",
      "pomodoro San Marzano", "aceite", "sal fina", "agua", "huevo",
    ];
    let seed = 42;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const cases: StandardIngredient[] = [];
    for (const name of names) {
      cases.push(ing({ name }));
      for (const unit of STANDARD_UNITS) {
        cases.push(ing({ qty: 1, unit, name }), ing({ qty: 0.5, unit, name }), ing({ qty: 1000, unit, name }));
        for (let k = 0; k < 20; k++) {
          const qty = Math.max(1, Math.floor(random() * 5_000_000)) / 1000;
          cases.push(ing({ qty, unit, name, note: "muy frío", section: "Farsa", pieceWeightG: 350 }));
        }
      }
    }
    for (const i of cases) {
      expect(StandardIngredientSchema.safeParse(i).success).toBe(true);
      const parsed = parseIngredient(formatIngredientLine(i));
      expect({ qty: parsed.quantity, unit: parsed.unit, name: parsed.name }).toEqual({ qty: i.qty, unit: i.unit, name: i.name });
    }
  });

  it("round-trips every standardized line", () => {
    const inputs = [...SECTIONED, ...FLAT, "20 cl ron", "1 cucharada de aceite", "½ limón", "2-3 dientes de ajo",
      "Sal fina, 8 g", "Harina 200 g", "sal c/s", "1 1/2 kg patata", "1 manojo de perejil"];
    for (const text of inputs) {
      const { ingredient } = line(text);
      const parsed = parseIngredient(formatIngredientLine(ingredient));
      expect({ qty: parsed.quantity, unit: parsed.unit, name: parsed.name })
        .toEqual({ qty: ingredient.qty, unit: ingredient.unit, name: ingredient.name });
    }
  });
});

describe("StandardIngredientSchema", () => {
  it("rejects invalid ingredients", () => {
    expect(StandardIngredientSchema.safeParse(ing({ qty: 4, name: "calamar" })).success).toBe(false);
    expect(StandardIngredientSchema.safeParse(ing({ unit: "g", name: "sal" })).success).toBe(false);
    expect(StandardIngredientSchema.safeParse(ing({ qty: -1, unit: "g", name: "sal" })).success).toBe(false);
    expect(StandardIngredientSchema.safeParse(ing({ name: "" })).success).toBe(false);
    expect(StandardIngredientSchema.safeParse(ing({ name: "x".repeat(201) })).success).toBe(false);
    expect(StandardIngredientSchema.safeParse(ing({ name: "sal", note: "x".repeat(301) })).success).toBe(false);
    expect(StandardIngredientSchema.safeParse(ing({ name: "sal", section: "x".repeat(81) })).success).toBe(false);
  });

  it("accepts the limits", () => {
    expect(StandardIngredientSchema.safeParse(ing({
      name: "x".repeat(200), note: "x".repeat(300), section: "x".repeat(80),
    })).success).toBe(true);
  });
});

describe("standardizeIngredient", () => {
  it("delegates strings to the line normalizer", () => {
    expect(standardizeIngredient("20 cl ron")).toEqual(line("20 cl ron"));
  });

  it.each([
    [{ qty: "1/2", unit: "kg", name: "patata" }, ing({ qty: 0.5, unit: "kg", name: "patata" }), ["fraction"]],
    [{ qty: "2-3", unit: "ud", name: "dientes de ajo" }, ing({ qty: 3, unit: "unidad", name: "diente de ajo", note: "2-3" }), ["range"]],
    [{ qty: 20, unit: "cl", name: "ron" }, ing({ qty: 200, unit: "ml", name: "ron" }), ["cl_dl"]],
    [{ qty: 1, unit: "cucharada", name: "aceite" }, ing({ name: "aceite", note: "1 cucharada" }), ["household"]],
    [{ qty: 2, unit: "taza", name: "harina" }, ing({ name: "harina", note: "2 taza" }), ["household"]],
    [{ qty: null, unit: "c/s", name: "sal" }, ing({ name: "sal", note: "c/s" }), ["household"]],
    [{ qty: 200, unit: "gr", name: "harina" }, ing({ qty: 200, unit: "g", name: "harina" }), []],
    [{ qty: "1,5", unit: "L", name: "leche" }, ing({ qty: 1.5, unit: "l", name: "leche" }), []],
    [{ qty: 4, unit: null, name: "huevos" }, ing({ qty: 4, unit: "unidad", name: "huevo" }), []],
    [{ qty: 2, unit: "oz", name: "mantequilla" }, ing({ name: "mantequilla", note: "2 oz" }), ["unmeasured"]],
    [{ qty: 3, unit: "latas", name: "tomate triturado" }, ing({ name: "tomate triturado", note: "3 latas" }), ["unmeasured"]],
    [{ qty: "abc", unit: "g", name: "sal" }, ing({ name: "sal" }), []],
    [{ qty: null, unit: null, name: "sal", note: "al gusto" }, ing({ name: "sal", note: "al gusto" }), []],
    [{ name: "200 g harina" }, ing({ qty: 200, unit: "g", name: "harina" }), []],
    [{ name: "sale q.b." }, ing({ name: "sale", note: "q.b." }), ["household"]],
    [{ qty: null, unit: "q.b.", name: "sale" }, ing({ name: "sale", note: "q.b." }), ["household"]],
    [{ qty: null, unit: null, name: "pimienta al gusto" }, ing({ name: "pimienta", note: "al gusto" }), ["household"]],
    [{ name: "1 bustina di lievito" }, ing({ name: "lievito", note: "1 bustina" }), ["unmeasured"]],
    [{ qty: 400, unit: "g", name: "rape limpio, muy frío (o merluza)" },
      ing({ qty: 400, unit: "g", name: "rape limpio", note: "muy frío, o merluza" }), ["note_split"]],
    [{ qty: 150, unit: "g", name: "gamba pelada, muy fría", note: "Muy fría" },
      ing({ qty: 150, unit: "g", name: "gamba pelada", note: "muy fría" }), ["note_split"]],
  ] as const)("normalizes %o", (item, expected, flags) => {
    const result = standardizeIngredient(item);
    expect(result.ingredient).toEqual(expected);
    expect(result.flags).toEqual(flags);
  });

  it("reads the piece weight from the name or the field", () => {
    expect(standardizeIngredient({
      qty: 4, unit: "pz", name: "calamares de 350 g aprox.", note: "tubos de 15–18 cm",
    }).ingredient).toEqual(ing({ qty: 4, unit: "unidad", name: "calamar", note: "tubos de 15–18 cm", pieceWeightG: 350 }));
    expect(standardizeIngredient({ qty: 4, unit: "ud", name: "calamares", pieceWeightG: "350" }).ingredient)
      .toEqual(ing({ qty: 4, unit: "unidad", name: "calamar", pieceWeightG: 350 }));
  });

  it("uses the section field and drops it from the name", () => {
    expect(standardizeIngredient({ section: "Aceite de chorizo", qty: 40, unit: "g", name: "AOVE (aceite de chorizo)" }).ingredient)
      .toEqual(ing({ section: "Aceite de chorizo", qty: 40, unit: "g", name: "AOVE" }));
    expect(standardizeIngredient({ section: "Para la farsa:", qty: 9, unit: "g", name: "sal fina" }).ingredient.section)
      .toBe("Farsa");
    expect(standardizeIngredient({ qty: 40, unit: "g", name: "AOVE (aceite de chorizo)" }, { knownSections: ["Aceite de chorizo"] })
      .ingredient.section).toBe("Aceite de chorizo");
  });

  it("always returns a schema-valid ingredient for a non-empty name", () => {
    const items = [
      { qty: "1/2", unit: "kg", name: "patata" }, { qty: 2, unit: "oz", name: "mantequilla" },
      { qty: 4, unit: "pz", name: "calamares de 350 g aprox." }, { name: "x".repeat(400), note: "y".repeat(500) },
    ];
    for (const item of items) expect(StandardIngredientSchema.safeParse(standardizeIngredient(item).ingredient).success).toBe(true);
  });
});

describe("standardizeIngredientLines", () => {
  it("reads every header style and strips the prefixes", () => {
    const result = standardizeIngredientLines([
      "Para la farsa:", "- 400 g rape", "",
      "## Per la salsa", "200 g pomodoro",
      "**For the dough:**", "500 g flour",
      "Para el caldo:", "1 l agua",
      "Ingredientes:", "sal c/s",
    ]);
    expect(result.ingredients.map((i) => [i.section, i.name])).toEqual([
      ["Farsa", "rape"], ["Salsa", "pomodoro"], ["Dough", "flour"], ["Caldo", "agua"], [null, "sal"],
    ]);
    expect(result.flags).toEqual(["markdown", "household"]);
  });

  it.each(["Ingredientes", "INGREDIENTI", "Ingredients", "**Ingredientes**", "## Ingredienti", "Ingredients:"])(
    "reads %s as a header that resets the section",
    (header) => {
      const result = standardizeIngredientLines(["**Farsa**", "400 g rape", header, "9 g sal"]);
      expect(result.ingredients.map((i) => [i.section, i.name])).toEqual([["Farsa", "rape"], [null, "sal"]]);
    },
  );

  it.each(["Método", "metodo", "**Método**", "## Procedimento", "Procedimiento:", "PREPARAZIONE", "Method"])(
    "ends the ingredient list at %s",
    (header) => {
      const result = standardizeIngredientLines([
        "Ingredientes", "200 g harina", header, "1. Mezcla la harina con el agua.", "Amasa 10 minutos.",
      ]);
      expect(result.ingredients.map((i) => [i.section, i.name])).toEqual([[null, "harina"]]);
    },
  );

  it("resumes the list at the next ingredients header", () => {
    const result = standardizeIngredientLines(["Procedimento", "Mescola tutto.", "Ingredienti", "2 uova"]);
    expect(result.ingredients.map((i) => [i.section, i.qty, i.name])).toEqual([[null, 2, "uovo"]]);
  });

  it("returns no ingredients for headers and blank lines only", () => {
    expect(standardizeIngredientLines(["**Farsa**", "  ", "- "])).toEqual({ ingredients: [], flags: [] });
  });
});

describe("INGREDIENT_RULES / renderRules", () => {
  const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

  it("states the shared core", () => {
    expect(INGREDIENT_RULES).toContain("g, kg, ml, l");
    expect(INGREDIENT_RULES).toContain("«ud»");
    expect(INGREDIENT_RULES).toContain("400 g rape limpio, muy frío");
    expect(INGREDIENT_RULES).toMatch(/singular/);
    expect(INGREDIENT_RULES).toMatch(/nota/);
  });

  it("adds the chat and extraction clauses to the core", () => {
    const chat = renderRules("chat");
    const extraction = renderRules("extraction");
    expect(chat.startsWith(INGREDIENT_RULES)).toBe(true);
    expect(extraction.startsWith(INGREDIENT_RULES)).toBe(true);
    expect(chat).toContain("**Farsa**");
    expect(chat).toMatch(/negrita/);
    expect(chat).toMatch(/cucharadas/);
    expect(extraction).toContain("`note`");
    expect(extraction).toContain("`section`");
    expect(extraction).toMatch(/no copies/);
  });

  it("stays short, has no placeholders and uses tuteo", () => {
    const chat = renderRules("chat");
    const extraction = renderRules("extraction");
    expect(words(chat) + words(extraction) - words(INGREDIENT_RULES)).toBeLessThan(180);
    for (const text of [chat, extraction]) {
      expect(text).not.toMatch(/\{\{|\}\}/);
      expect(text).not.toMatch(/\b(escribí|poné|reescribí|copiés|dejá|usá|pegués|escriba|ponga|copie)(?![a-záéíóúñ])/i);
    }
  });
});

describe("EXTRACTION_INGREDIENT_JSON_SCHEMA", () => {
  it("describes one standard ingredient", () => {
    const schema = EXTRACTION_INGREDIENT_JSON_SCHEMA;
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
    expect([...schema.required].sort()).toEqual(["name", "note", "pieceWeightG", "qty", "section", "unit"]);
    expect(schema.properties.unit.enum).toEqual([...STANDARD_UNITS, null]);
    for (const unit of STANDARD_UNITS) expect(schema.properties.unit.description).toContain(unit);
  });
});
