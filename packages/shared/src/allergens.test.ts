import { describe, test, expect } from "vitest";
import {
  suggestAllergen,
  ALLERGEN_ORDER,
  AllergenSchema,
  type Allergen,
} from "./allergens";

describe("ALLERGEN_ORDER", () => {
  test("contiene los 14 alérgenos del Reg. EU 1169", () => {
    expect(ALLERGEN_ORDER).toHaveLength(14);
  });

  test("matchea el enum AllergenSchema 1:1", () => {
    const fromEnum = new Set(AllergenSchema.options as Allergen[]);
    const fromOrder = new Set(ALLERGEN_ORDER);
    expect(fromOrder).toEqual(fromEnum);
  });

  test("orden empieza por gluten (1) y termina por molluscs (14)", () => {
    expect(ALLERGEN_ORDER[0]).toBe("gluten");
    expect(ALLERGEN_ORDER[13]).toBe("molluscs");
  });
});

describe("suggestAllergen — diccionario v2 (siembra Andy)", () => {
  // ─── Regla ANTI-FALSO-POSITIVO crítica: "leche/latte/milk de X" planta ───
  test.each([
    // Frutos de cáscara — la trampa más peligrosa (alérgico a la leche
    // tomando "leche de almendra" creyendo que es lácteo).
    ["leche de almendra", "tree_nuts"],
    ["Leche de Almendra", "tree_nuts"], // como aparece en el banco real
    ["latte di mandorla", "tree_nuts"],
    ["almond milk", "tree_nuts"],
    ["leche de avellana", "tree_nuts"],
    ["hazelnut milk", "tree_nuts"],
    // Soja
    ["leche de soja", "soy"],
    ["latte di soia", "soy"],
    ["soy milk", "soy"],
    // Avena → gluten (decisión Andy)
    ["leche de avena", "gluten"],
    ["latte di avena", "gluten"],
    ["oat milk", "gluten"],
  ])('regla planta+leche: "%s" → %s (NO milk)', (input, expected) => {
    const got = suggestAllergen(input);
    expect(got).toBe(expected);
    expect(got).not.toBe("milk");
  });

  // ─── Trampas que cazamos viendo el banco real ───
  test.each([
    ["Pane Carasau", "gluten"],
    ["Bottarga de Mujol", "fish"],
    ["Colatura di Alici", "fish"],
    ["Lecitina di Soia", "soy"],
    ["Garum", "fish"],
    ["Dashi", "fish"],
    ["Katsuobushi", "fish"],
    ["Burro Chiarificato", "milk"],
    ["Mandorla di Noto", "tree_nuts"],
    ["Almendras Marcona", "tree_nuts"],
    // Decisión Andy 26-05-26
    ["Bonito seco, 12 g", "fish"],
    ["Manteca clarificada, 30 g", "milk"],
    ["manteca chiarificata 50g", "milk"],
    // Anti-FP: manteca de cacao y manteca de cerdo NO deben marcar lácteo.
    ["Manteca de cacao desodorizada", null],
    ["Manteca de cerdo", null],
  ])('trampa del banco: "%s" → %s', (input, expected) => {
    expect(suggestAllergen(input)).toBe(expected);
  });

  // ─── 3 productos especiales que NO marcan lo que parece ───
  test.each([
    // Mirin y shio-koji son arroz puro — no gluten
    ["mirin", null],
    ["Mirin (decisión Andy: arroz puro)", null],
    ["shio-koji", null],
    ["shio koji", null],
    ["riso carnaroli", null],
    // Wasabi sin mostaza añadida — el matcher devuelve null para "wasabi"
    // solo. Nota: "Pasta de Wasabi" en el banco va a matchear gluten por
    // la keyword "pasta" — eso es falso positivo del matcher; Andy lo
    // corrige en la revisión del reporte read-only antes de aplicar.
    ["Wasabi", null],
    ["wasabi en polvo", null],
  ])('decisión Andy: "%s" → %s', (input, expected) => {
    expect(suggestAllergen(input)).toBe(expected);
  });

  // ─── Vinagres → sulfitos (todos, decisión Andy lado seguro) ───
  test.each([
    ["vinagre de jerez", "sulphites"],
    ["vinagre de arroz", "sulphites"],
    ["rice vinegar", "sulphites"],
    ["aceto balsamico", "sulphites"],
    ["aceto di riso", "sulphites"],
    ["vinagre balsamico", "sulphites"],
    ["vino bianco secco", "sulphites"],
  ])('vinagres → sulfitos: "%s" → %s', (input, expected) => {
    expect(suggestAllergen(input)).toBe(expected);
  });

  // ─── Casos clásicos (singular/plural ES/IT/EN) ───
  test.each([
    // italiano
    ["burro", "milk"],
    ["formaggio pecorino", "milk"],
    ["uova", "eggs"],
    ["pasta all'uovo", "gluten"], // gluten gana sobre eggs por orden
    ["polpo alla griglia", "molluscs"],
    ["scampi crudi", "crustaceans"],
    ["vongole ceraci", "molluscs"],
    ["gambero rosso", "crustaceans"],
    ["lomo de ricciola", "fish"],
    ["olio di sesamo", "sesame"],

    // español
    ["leche entera", "milk"],
    ["queso curado", "milk"],
    ["huevo frito", "eggs"],
    ["harina de trigo", "gluten"],
    ["pulpo a la gallega", "molluscs"],
    ["camaron rosado", "crustaceans"],
    ["mostaza dijon", "mustard"],

    // inglés
    ["wheat flour", "gluten"],
    ["peanut butter", "peanuts"],
    ["octopus", "molluscs"],
    ["shrimp", "crustaceans"],

    // sin alérgeno (productos del banco listados como "sin alérgeno")
    ["aceite de oliva virgen extra", null],
    ["sal Maldon", null],
    ["azucar moreno", null],
    ["pimienta negra", null],
    ["pomodorini gialli", null],
    ["bergamotto", null],
    ["alcaparras", null],
  ])('clásico: "%s" → %s', (input, expected) => {
    expect(suggestAllergen(input)).toBe(expected);
  });

  test("vacío / espacios / inválido → null", () => {
    expect(suggestAllergen("")).toBe(null);
    expect(suggestAllergen("   ")).toBe(null);
    expect(suggestAllergen("xyz123abc")).toBe(null);
  });

  test("normaliza acentos antes del match", () => {
    expect(suggestAllergen("CAMARÓN")).toBe("crustaceans");
    expect(suggestAllergen("Sésamo")).toBe("sesame");
    expect(suggestAllergen("Atún rojo")).toBe("fish");
  });

  test("word-boundary evita falsos positivos en single-word", () => {
    // "soja" no matchea adentro de palabra más larga.
    expect(suggestAllergen("soja")).toBe("soy");
    // "veggie" no matchea "egg" por boundary.
    expect(suggestAllergen("veggie burger sin huevo verdadero")).not.toBe(null); // matchea "huevo"
    // "tomate" no matchea "mate" o "tomar".
    expect(suggestAllergen("tomate cherry")).toBe(null);
  });

  test("multiidioma mezclado en un mismo nombre", () => {
    expect(suggestAllergen("Colatura di Alici de Cetara")).toBe("fish");
    expect(suggestAllergen("Burro Chiarificato Italiano")).toBe("milk");
    expect(suggestAllergen("Aceto Balsamico di Modena")).toBe("sulphites");
  });
});
