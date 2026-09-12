// A-11 — Helper para traducir errores de API. El server adjunta un `code`
// machine-readable en cualquier respuesta de error que el cliente quiere
// mostrar localizada. Acá hacemos el lookup en i18n; si no hay code (cliente
// hablando con un server viejo, o error de red), caemos al `err.message`
// del server o a "error_network".

import type { ApiErrorCode } from "@atelier/shared";
import type { TranslationKey } from "@atelier/i18n";
import { ApiError, NetworkError } from "@/src/api/client";

// Codes del flujo eliminar-cuenta (DELETE /api/me). La API se construye en
// paralelo, así que pueden no estar todavía en el enum de shared; la unión
// colapsa sola cuando lleguen (mismo string = mismo miembro).
type KnownApiErrorCode =
  | ApiErrorCode
  | "confirm_mismatch"
  | "last_admin"
  | "case_changed"
  | "stripe_cancel_failed"
  | "apple_revoke_failed";

// Mapeo exhaustivo (typecheck force: si se agrega un code en shared sin la
// key i18n correspondiente, TS rompe).
const CODE_TO_KEY: Record<KnownApiErrorCode, TranslationKey> = {
  ai_budget_exhausted: "ai_budget_exhausted",
  ai_budget_expired: "ai_budget_expired",
  ai_budget_unavailable: "ai_budget_unavailable",
  ai_daily_chat_limit: "ai_daily_chat_limit",
  ai_daily_weekly_limit: "ai_daily_weekly_limit",
  ai_creative_limit: "ai_creative_limit",
  ai_provider_unconfigured: "ai_provider_unconfigured",
  memory_conflict: "memory_conflict",
  menu_style_invalid: "menu_style_invalid",
  menu_style_not_configured: "menu_style_not_configured",
  menu_style_changed: "menu_style_changed",
  menu_style_not_found: "menu_style_not_found",
  menu_style_active: "menu_style_active",
  menu_style_extraction_failed: "menu_style_extraction_failed",
  recipe_save_conflict: "recipe_save_conflict",
  idea_save_conflict: "idea_save_conflict",
  idea_owner_changed: "idea_owner_changed",
  idea_already_deleted: "idea_already_deleted",
  invalid_conversation_reference: "error_forbidden",
  chat_in_progress: "chat_in_progress",
  chat_request_conflict: "chat_request_conflict",
  allergens_incomplete: "allergens_incomplete",
  email_invalid: "error_email_invalid",
  rate_limited: "error_rate_limited",
  email_send_failed: "error_email_send_failed",
  token_missing: "error_token_missing",
  token_invalid: "error_token_invalid",
  token_expired: "error_token_expired",
  invite_rate_limited: "error_invite_rate_limited",
  invite_code_invalid: "error_invite_code_invalid",
  already_in_restaurant: "error_already_in_restaurant",
  google_signin_failed: "error_google_signin",
  apple_signin_failed: "error_apple_signin",
  apple_revoke_failed: "error_apple_revoke",
  apple_revoke_failed_after_stripe: "error_apple_revoke_after_stripe",
  ai_daily_limit: "error_ai_daily_limit",
  recipe_extraction_failed: "error_recipe_extraction_failed",
  file_invalid: "error_file_invalid",
  gdoc_access_denied: "error_gdoc_access_denied",
  forbidden: "error_forbidden",
  plan_inactive: "error_plan_inactive",
  confirm_mismatch: "error_confirm_mismatch",
  last_admin: "error_last_admin",
  case_changed: "error_case_changed",
  stripe_cancel_failed: "error_stripe_cancel_failed",
};

type T = (key: TranslationKey, vars?: Record<string, string | number>) => string;

export function apiErrorMessage(err: unknown, t: T): string {
  if (err instanceof ApiError && err.code) {
    // Un code que el cliente no conoce (server más nuevo que el APK) cae al
    // message del server en vez de renderear t(undefined) → "undefined".
    const key: TranslationKey | undefined = CODE_TO_KEY[err.code];
    if (key) return t(key);
    return err.message;
  }
  // NetworkError.message es un code interno (network_unreachable /
  // request_timeout), no texto para humanos.
  if (err instanceof NetworkError) return t("error_network");
  if (err instanceof Error) {
    if (err.message.startsWith("ai_provider_http_") || ["ai_response_blocked", "ai_stream_invalid", "ai_response_invalid", "chat_context_too_long"].includes(err.message) || err.name === "TimeoutError") return t("ai_provider_failed");
    if (err.message === "chat_response_incomplete" || err.message === "chat_generation_expired") return t("chat_response_incomplete");
    const key = CODE_TO_KEY[err.message as KnownApiErrorCode];
    return key ? t(key) : err.message;
  }
  return t("error_network");
}
