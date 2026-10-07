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
