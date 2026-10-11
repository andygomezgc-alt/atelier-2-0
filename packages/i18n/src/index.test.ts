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

describe("A2 chat error translations", () => {
  const spanish: Record<string, string> = {
    error_ai_provider_failed: "El asistente no respondió. Inténtalo de nuevo.",
    error_ai_rate_limited: "El asistente está saturado. Prueba en un minuto.",
    error_ai_timeout: "El asistente tardó demasiado. Inténtalo de nuevo.",
    error_ai_response_blocked: "El asistente no puede responder a esto. Reformúlalo.",
    error_chat_refused: "El Creativo no puede responder a esta consulta. Reformúlala o pruébala en el Diario.",
    error_chat_response_incomplete: "La respuesta quedó incompleta. Inténtalo de nuevo.",
    error_chat_context_too_long: "Esta conversación es demasiado larga. Empieza un chat nuevo.",
  };

  test("has the exact short Spanish copy and one key in each language", () => {
    for (const [key, expected] of Object.entries(spanish)) {
      expect(Object.prototype.hasOwnProperty.call(es, key), key).toBe(true);
      expect((es as Record<string, string>)[key]).toBe(expected);
      for (const dict of [en, itDict]) {
        expect(Object.prototype.hasOwnProperty.call(dict, key), key).toBe(true);
        const value = (dict as Record<string, string>)[key];
        expect(value?.trim()).toBeTruthy();
        expect(value).not.toBe(expected);
        expect(value).not.toContain("_");
      }
    }
  });
});

describe("A3 honest chat error copy", () => {
  const spanish: Record<string, string> = {
    chat_unanswered: "La última pregunta quedó sin respuesta.",
    chat_use_daily: "Continuar con Diario",
    error_session_expired: "Tu sesión caducó. Vuelve a iniciar sesión.",
  };

  test("has the Spanish copy and a translation in each language", () => {
    for (const [key, expected] of Object.entries(spanish)) {
      expect((es as Record<string, string>)[key], key).toBe(expected);
      for (const dict of [en, itDict]) {
        const value = (dict as Record<string, string>)[key];
        expect(value?.trim(), key).toBeTruthy();
        expect(value).not.toBe(expected);
        expect(value).not.toContain("_");
      }
    }
  });
});

// A3b — the stream transport signs out by itself; the banner has no sign-in button.
describe("A3b no sign-in button in the chat banner", () => {
  test("drops the unused sign-in button copy", () => {
    for (const dict of [es, en, itDict]) expect(Object.keys(dict)).not.toContain("chat_sign_in");
  });
});

// A10 — a failed history upload has its own reason, not the generic "the assistant did not answer".
describe("A10 chat history upload copy", () => {
  test("has the Spanish copy and a translation in each language", () => {
    expect((es as Record<string, string>).chat_history_upload_failed).toBe("No se pudo guardar el historial de este chat. Inténtalo de nuevo.");
    for (const dict of [en, itDict]) {
      const value = (dict as Record<string, string>).chat_history_upload_failed;
      expect(value?.trim(), "chat_history_upload_failed").toBeTruthy();
      expect(value).not.toBe((es as Record<string, string>).chat_history_upload_failed);
      expect(value).not.toContain("_");
    }
  });
});

// A13 — the stop control is labelled in every language, with the same short imperative tone as "send".
describe("A13 chat stop copy", () => {
  test("has the Spanish copy and a translation in each language", () => {
    expect((es as Record<string, string>).chat_stop_answer).toBe("Detener");
    for (const dict of [en, itDict]) {
      const value = (dict as Record<string, string>).chat_stop_answer;
      expect(value?.trim(), "chat_stop_answer").toBeTruthy();
      expect(value).not.toBe((es as Record<string, string>).chat_stop_answer);
      expect(value).not.toContain("_");
    }
  });
});

// A13b — a recovered answer shows a status while it is being recovered, in every language.
describe("A13b chat recovering copy", () => {
  test("has a translation in each language, distinct from the Spanish one", () => {
    const key = "chat_answer_recovering";
    const spanish = (es as Record<string, string>)[key];
    for (const dict of [es, en, itDict]) {
      const value = (dict as Record<string, string>)[key];
      expect(value?.trim(), key).toBeTruthy();
      expect(value, key).not.toContain("_");
    }
    expect((en as Record<string, string>)[key], key).not.toBe(spanish);
    expect((itDict as Record<string, string>)[key], key).not.toBe(spanish);
  });
});
