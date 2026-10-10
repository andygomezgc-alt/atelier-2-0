import { describe, it, expect, vi } from "vitest";

// `api-error.ts` importa `ApiError` de `@/src/api/client`, que a su vez
// importa `expo-secure-store` (módulo nativo). Sin mock, vitest no puede
// resolverlo y el archivo de test directamente no parsea.
vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => undefined),
  deleteItemAsync: vi.fn(async () => undefined),
}));

import { apiErrorMessage } from "../api-error";
import { ApiError } from "@/src/api/client";
import { t } from "@atelier/i18n";
import { ApiErrorCodeSchema } from "@atelier/shared";
import { StreamInterruptedError } from "@/src/api/conversations";

// Mock minimal de `t` — devuelve el key entre corchetes. Suficiente para
// validar que el helper hace el lookup correcto sin acoplarnos al texto
// exacto en es/it/en (eso lo cubre el typecheck via TranslationKey).
function tStub(key: string) {
  return `[${key}]`;
}

describe("apiErrorMessage (A-11)", () => {
  it.each(["es", "it", "en"] as const)("translates the weekly quota in %s for HTTP and streamed errors", language => {
    const translate = (key: Parameters<typeof t>[0]) => t(key, language);
    for (const error of [new Error("ai_daily_weekly_limit"), new ApiError(429, "fallback", "ai_daily_weekly_limit")]) {
      const message = apiErrorMessage(error, translate);
      expect(message).toContain("140");
      expect(message).toContain("7");
      expect(message).not.toMatch(/mañana|domani|tomorrow|ai_daily_weekly_limit/);
    }
  });
  it("usa el code cuando viene de ApiError", () => {
    const err = new ApiError(401, "Token expirado", "token_expired");
    expect(apiErrorMessage(err, tStub as never)).toBe("[error_token_expired]");
  });

  it("cae al message del server cuando ApiError no trae code (back-compat)", () => {
    const err = new ApiError(500, "Boom del server");
    expect(apiErrorMessage(err, tStub as never)).toBe("Boom del server");
  });

  it("usa err.message para Error genéricos (no ApiError)", () => {
    const err = new Error("Network down");
    expect(apiErrorMessage(err, tStub as never)).toBe("Network down");
  });

  it("cae a error_network cuando no es un Error", () => {
    expect(apiErrorMessage("string raro", tStub as never)).toBe("[error_network]");
  });

  it("mapea los códigos principales a sus keys i18n", () => {
    const cases: Array<[string, string]> = [
      ["email_invalid", "[error_email_invalid]"],
      ["rate_limited", "[error_rate_limited]"],
      ["email_send_failed", "[error_email_send_failed]"],
      ["token_missing", "[error_token_missing]"],
      ["token_invalid", "[error_token_invalid]"],
      ["token_expired", "[error_token_expired]"],
      ["invite_rate_limited", "[error_invite_rate_limited]"],
      ["invite_code_invalid", "[error_invite_code_invalid]"],
      ["already_in_restaurant", "[error_already_in_restaurant]"],
      ["google_signin_failed", "[error_google_signin]"],
      ["apple_signin_failed", "[error_apple_signin]"],
      ["apple_revoke_failed", "[error_apple_revoke]"],
      [
        "apple_revoke_failed_after_stripe",
        "[error_apple_revoke_after_stripe]",
      ],
    ];
    for (const [code, expected] of cases) {
      const err = new ApiError(400, "fallback", code as never);
      expect(apiErrorMessage(err, tStub as never)).toBe(expected);
    }
  });
});

describe("A2 chat error localization", () => {
  const codes = [
    "ai_provider_failed", "ai_rate_limited", "ai_timeout", "ai_response_blocked",
    "chat_refused", "chat_response_incomplete", "chat_context_too_long",
  ];

  it("maps every new closed code to its error_<code> translation", () => {
    for (const code of codes) {
      expect(ApiErrorCodeSchema.safeParse(code).success, code).toBe(true);
      const error = new ApiError(503, "private upstream text", code as never);
      expect(apiErrorMessage(error, tStub as never), code).toBe(`[error_${code}]`);
    }
  });

  it("maps typed SSE errors through the same code-to-key table", () => {
    for (const code of codes) {
      const error = new StreamInterruptedError(code, "Partial");
      expect(apiErrorMessage(error, tStub as never), code).toBe(`[error_${code}]`);
    }
  });

  it("never shows a raw provider message for a known coded error", () => {
    const error = new ApiError(500, "secret provider body", "ai_provider_failed" as never);
    expect(apiErrorMessage(error, key => t(key, "es"))).toBe("El asistente no respondió. Inténtalo de nuevo.");
  });
});
