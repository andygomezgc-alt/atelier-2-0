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

// Tuteo — the Spanish copy addresses the user as tú, never vos or usted.
// chat_greet keeps its Italian greeting until that greeting is decided.
describe("Spanish copy addresses the user as tú", () => {
  const spanish: Record<string, string> = {
    casa_photo_unsupported: "Elige una imagen JPG, PNG o WebP.",
    casa_photo_upload_failed: "No pude guardar la foto. Prueba con otra imagen.",
    leave_case_a_body: "Vas a perder acceso. Puedes volver con un código nuevo.",
    leave_case_b_body: "Eres el único administrador. Pasa el rol de administrador a otro miembro antes de salir.",
    leave_case_c_body: "Eres el último miembro. Salir borra permanentemente el restaurante y todo su contenido: recetas, menús, productos, ideas, conversaciones. Esta acción no se puede deshacer.",
    leave_case_c_typing_hint: "Para confirmar, escribe el nombre exacto del restaurante ({name}):",
    delete_account_case_b_body: "Eres el único admin de {name}. Pasa el rol de admin a otro miembro antes de eliminar tu cuenta.",
    delete_account_case_c_body: "Eres el último miembro: se eliminará TODO el restaurante {name} — recetas, menús, productos y conversaciones — de forma permanente.",
    delete_account_typing_hint: "Para confirmar, tipea tu email exacto ({email}):",
    recipe_bank_subtitle: "Elige una receta aprobada para añadir como plato.",
    recipe_bank_empty_sub: "Aprueba una receta para poder usarla en un menú.",
    empty_menu_hint: "Tu carta está vacía. Empieza agregando una sección o un plato.",
    chat_placeholder_voice: "Escribe o dicta…",
    extract_fail_body: "Puedes guardarla como borrador y editarla a mano.",
    profile_go_pro: "Hazte Pro",
    error_recipe_extraction_failed: "No pude leer bien la receta. Prueba con otro texto o archivo.",
    error_file_invalid: "Ese archivo no sirve: sube un PDF o DOCX válido (máx 10 MB).",
    error_forbidden: "No tienes permiso para hacer esto.",
    error_plan_inactive: "Tu plan está inactivo. Actívalo para seguir creando.",
    recetas_cargar_error: "No se pudo leer el archivo. Prueba con otro.",
    cargar_foto_hint: "También puedes cargar una foto de la receta y la organizo.",
    toast_recipe_uploaded: "Receta procesada — revisa y guarda",
    export_preview_subtitle: "Confirma el estilo antes de exportar",
    export_preview_hint: "Modifica nombres, descripciones o precios desde la carta antes de descargar.",
    empty_productos_sub: "Carga tu primer producto desde aquí.",
    recetas_aviso_no_pezzatura_unit: "Este producto se mide por peso, no por unidad. Cambia la unidad a g/kg o cambia el producto.",
    confirm_archive_producto_body: "El producto deja de estar disponible para recetas nuevas. Puedes reactivarlo después.",
    confirm_delete_producto_in_use_body: "Este producto aparece en {count} recetas. ¿Quieres eliminarlo (a la papelera) igual?",
    yield_pending_high_warning: "Producto crítico con merma sugerida. Registra una prueba para tener costo real preciso.",
    productos_criticos_pendientes_body: "{count} productos críticos con merma sugerida. Prueba su rendimiento real.",
    section_explainer_inicio: "Tu bloc de cocina. Anota ideas sueltas y trabájalas con el Asistente cuando estés listo.",
    section_explainer_asistente: "Convierte ideas en recetas: pide técnicas, ajusta un plato hasta dejarlo afilado.",
    section_explainer_recetas: "Tu libro de recetas con costo, merma y rendimiento. Importa PDFs o suma nuevas a mano.",
    section_explainer_menus: "Combina recetas en cartas (degustación, fija, eventos) listas para imprimir.",
    chat_save_needs_restaurant: "Para guardar, primero crea tu restaurante o proyecto.",
    lazy_modal_sub: "Restaurante, proyecto, equipo: como lo llames. Después puedes cambiarlo.",
    error_rate_limited: "Demasiadas solicitudes. Prueba de nuevo en unos minutos.",
    error_email_send_failed: "No se pudo enviar el correo. Prueba de nuevo.",
    error_token_invalid: "Código no válido. Pide un enlace nuevo.",
    error_token_expired: "El código caducó. Pide un enlace nuevo.",
    error_invite_rate_limited: "Demasiados intentos. Espera unos minutos antes de volver a intentarlo.",
    error_invite_code_invalid: "Código no válido o expirado. Pídele al admin que genere uno nuevo.",
    error_last_admin: "Eres el único admin. Pasa el rol de admin a otro miembro primero.",
    error_case_changed: "La situación cambió mientras confirmabas. Revisa de nuevo antes de seguir.",
    error_stripe_cancel_failed: "No se pudo cancelar la suscripción. No se borró nada — prueba de nuevo.",
    casa_lobby_sub: "Empieza creando tu restaurante o proyecto, o pega un código para unirte al equipo de alguien.",
  };

  for (const [key, expected] of Object.entries(spanish)) {
    test(`es.${key} addresses the user as tú`, () => {
      expect((es as Record<string, string>)[key], key).toBe(expected);
    });
  }

  test("es.chat_greet keeps its Italian greeting", () => {
    expect(es.chat_greet).toBe("Buongiorno, Chef.");
  });
});

// Costes por ingrediente (A2) — reasons under each ingredient and the fix sheet.
describe("per-ingredient cost copy", () => {
  const spanish: Record<string, string> = {
    cost_line_no_product: "Sin producto del banco",
    cost_line_no_price: "Falta el precio",
    cost_line_no_quantity: "Falta la cantidad",
    cost_line_needs_density: "Falta cuánto pesa 1 litro",
    cost_line_needs_piece_weight: "Falta cuánto pesa 1 unidad",
    cost_line_incompatible_unit: "La receta usa {recipeUnit} y el producto se compra por {purchaseUnit}",
    cost_line_invalid_merma: "Merma no válida",
    gramos_por_litro_label: "1 litro pesa (g)",
    gramos_por_litro_hint: "Para pasar de gramos a litros en las recetas",
    peso_por_unidad_label: "1 unidad pesa (g)",
  };
  const otherKeys = [
    "gramos_por_litro_suggested",
    "grams_invalid",
    "fix_sheet_price_label",
    "fix_sheet_incompatible",
    "fix_sheet_error_price",
  ];

  test("has the exact Spanish copy", () => {
    for (const [key, expected] of Object.entries(spanish)) {
      expect((es as Record<string, string>)[key], key).toBe(expected);
    }
  });

  test("has every key in each language, with the same placeholders", () => {
    for (const key of [...Object.keys(spanish), ...otherKeys]) {
      const placeholders = ((es as Record<string, string>)[key] ?? "").match(/\{\w+\}/g) ?? [];
      for (const dict of [es, en, itDict]) {
        const value = (dict as Record<string, string>)[key];
        expect(value?.trim(), key).toBeTruthy();
        expect(value, key).not.toContain("_");
        expect(value?.match(/\{\w+\}/g) ?? [], key).toEqual(placeholders);
      }
    }
  });

  test("interpolates both units of an incompatible pair", () => {
    expect(t("cost_line_incompatible_unit", "es", { recipeUnit: "unidad", purchaseUnit: "l" })).toBe(
      "La receta usa unidad y el producto se compra por l",
    );
  });
});
