import { describe, it, expect } from "vitest";
import { ApiErrorResponseSchema, ApiErrorCodeSchema } from "./api-contract";
import * as apiContract from "./api-contract";

const CHAT_CODES = [
  "ai_provider_failed", "ai_rate_limited", "ai_timeout", "ai_response_blocked",
  "chat_refused", "chat_response_incomplete", "chat_context_too_long",
] as const;
const RETRYABLE = ["ai_provider_failed", "ai_rate_limited", "ai_timeout", "chat_response_incomplete"];

describe("A2 chat error contract", () => {
  it("accepts all new chat codes without losing budget, turn, or permission codes", () => {
    for (const code of [...CHAT_CODES, "ai_budget_exhausted", "ai_budget_expired", "ai_budget_unavailable", "ai_daily_weekly_limit", "ai_creative_limit", "chat_in_progress", "chat_request_conflict", "forbidden"]) {
      expect(ApiErrorCodeSchema.safeParse(code).success, code).toBe(true);
    }
    expect(new Set(ApiErrorCodeSchema.options).size).toBe(ApiErrorCodeSchema.options.length);
    expect(ApiErrorCodeSchema.options).toHaveLength(53);
  });

  it("exports one closed retryability policy", () => {
    const candidate: unknown = Reflect.get(apiContract, "isRetryableChatError");
    expect(candidate).toBeTypeOf("function");
    if (typeof candidate !== "function") return;
    for (const code of ApiErrorCodeSchema.options) {
      expect(candidate(code), code).toBe(RETRYABLE.includes(code));
    }
    expect(candidate("not_a_chat_code")).toBe(false);
  });
});

describe("ApiErrorCodeSchema (A-11)", () => {
  it("acepta los 17 codes definidos", () => {
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
      "recipe_extraction_failed",
      "file_invalid",
      "gdoc_access_denied",
      "forbidden",
      "plan_inactive",
      "chef_notes_limit",
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
