import { describe, expect, it as test } from "vitest";
import { t, es, it as itDict, en } from "./index";

describe("t()", () => {
  test("returns Spanish by default", () => {
    expect(t("tab_inicio")).toBe("Inicio");
  });

  test("interpolates {name}", () => {
    expect(t("inicio_greet", "es", { name: "Andrea" })).toBe("Hola, Andrea —");
    expect(t("inicio_greet", "it", { name: "Andrea" })).toBe("Ciao, Andrea —");
    expect(t("inicio_greet", "en", { name: "Andrea" })).toBe("Hi, Andrea —");
  });

  test("falls back to ES when language dict is unknown", () => {
    // @ts-expect-error - testing a runtime fallback path
    expect(t("tab_inicio", "fr")).toBe("Inicio");
  });
});

describe("dictionary parity", () => {
  test("IT has the same keys as ES", () => {
    expect(Object.keys(itDict).sort()).toEqual(Object.keys(es).sort());
  });

  test("EN has the same keys as ES", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(es).sort());
  });
});

describe("memory enabled translations", () => {
  const expected = {
    chat_memory: { es: "Memoria", it: "Memoria", en: "Memory" },
    chat_memory_off: { es: "Memoria apagada", it: "Memoria spenta", en: "Memory off" },
    chat_memory_hint: {
      es: "Abre Nuestra cocina para ver o apagar la memoria.",
      it: "Apre La nostra cucina per vedere o spegnere la memoria.",
      en: "Opens Our kitchen to see or turn off the memory.",
    },
    memory_city: {
      es: "Ciudad o zona (opcional)",
      it: "Città o zona (facoltativo)",
      en: "City or area (optional)",
    },
    memory_city_hint: { es: "Ej.: Ancona, Marche", it: "Es.: Ancona, Marche", en: "E.g. Ancona, Marche" },
    onboard_create_city_label: {
      es: "Ciudad o zona (opcional)",
      it: "Città o zona (facoltativo)",
      en: "City or area (optional)",
    },
    onboard_create_city_placeholder: { es: "Ej.: Ancona, Marche", it: "Es.: Ancona, Marche", en: "E.g. Ancona, Marche" },
    recipe_import_approved: {
      es: "Al guardarla queda aprobada y la memoria aprende de ella.",
      it: "Una volta salvata, la ricetta resta approvata e la memoria impara da essa.",
      en: "Once saved, it is approved and the memory learns from it.",
    },
    recipe_import_in_test: {
      es: "Al guardarla queda en prueba y la memoria aprende de ella.",
      it: "Una volta salvata, la ricetta resta in prova e la memoria impara da essa.",
      en: "Once saved, it stays in testing and the memory learns from it.",
    },
    memory_note: {
      es: "Aprende de las recetas en prueba y aprobadas: al momento cuando cargas una y una vez por semana con los demás cambios. Tu petición en el chat siempre tiene prioridad.",
      it: "Impara dalle ricette in prova e approvate: subito quando ne carichi una e una volta a settimana con le altre modifiche. La tua richiesta in chat ha sempre la precedenza.",
      en: "Learns from recipes in testing and approved recipes: right away when you upload one, and once a week from other changes. Your current chat request always takes priority.",
    },
  };
  const dictionaries: Record<string, Record<string, string>> = { es, it: itDict, en };

  for (const [key, translations] of Object.entries(expected)) {
    for (const [language, text] of Object.entries(translations)) {
      test(`${language}.${key} matches the E1 text`, () => {
        expect(dictionaries[language]![key]).toBe(text);
      });
    }
  }
});
