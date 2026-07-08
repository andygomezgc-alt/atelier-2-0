import { describe, it, expect } from "vitest";
import { ApiErrorResponseSchema, ApiErrorCodeSchema } from "./api-contract";

describe("ApiErrorCodeSchema (A-11)", () => {
  it("acepta los 11 codes definidos", () => {
    const codes = [
      "email_invalid",
      "rate_limited",
      "email_send_failed",
      "token_missing",
      "token_invalid",
      "token_expired",
      "invite_rate_limited",
      "invite_code_invalid",
      "already_in_restaurant",
      "google_signin_failed",
      "ai_daily_limit",
    ];
    for (const c of codes) {
      expect(ApiErrorCodeSchema.safeParse(c).success).toBe(true);
    }
  });

  it("rechaza un code desconocido", () => {
    expect(ApiErrorCodeSchema.safeParse("unknown_thing").success).toBe(false);
  });
});

describe("ApiErrorResponseSchema (A-11)", () => {
  it("acepta {error, code} canónico", () => {
    expect(
      ApiErrorResponseSchema.safeParse({
        error: "Token expirado",
        code: "token_expired",
      }).success,
    ).toBe(true);
  });

  it("acepta {error} sin code (retro-compat para clientes viejos)", () => {
    expect(
      ApiErrorResponseSchema.safeParse({ error: "Algún error" }).success,
    ).toBe(true);
  });

  it("rechaza si falta `error`", () => {
    expect(
      ApiErrorResponseSchema.safeParse({ code: "token_expired" }).success,
    ).toBe(false);
  });

  it("rechaza si `code` no está en el enum", () => {
    expect(
      ApiErrorResponseSchema.safeParse({
        error: "x",
        code: "made_up_code",
      }).success,
    ).toBe(false);
  });
});
