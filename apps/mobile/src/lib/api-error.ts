// A-11 — Helper para traducir errores de API. El server adjunta un `code`
// machine-readable en cualquier respuesta de error que el cliente quiere
// mostrar localizada. Acá hacemos el lookup en i18n; si no hay code (cliente
// hablando con un server viejo, o error de red), caemos al `err.message`
// del server o a "error_network".

import type { ApiErrorCode } from "@atelier/shared";
import type { TranslationKey } from "@atelier/i18n";
import { ApiError, NetworkError } from "@/src/api/client";

// Mapeo exhaustivo (typecheck force: si se agrega un code en shared sin la
// key i18n correspondiente, TS rompe).
const CODE_TO_KEY: Record<ApiErrorCode, TranslationKey> = {
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
  ai_daily_limit: "error_ai_daily_limit",
  recipe_extraction_failed: "error_recipe_extraction_failed",
  file_invalid: "error_file_invalid",
  gdoc_access_denied: "error_gdoc_access_denied",
  forbidden: "error_forbidden",
  plan_inactive: "error_plan_inactive",
};

type T = (key: TranslationKey, vars?: Record<string, string | number>) => string;

export function apiErrorMessage(err: unknown, t: T): string {
  if (err instanceof ApiError && err.code) {
    return t(CODE_TO_KEY[err.code]);
  }
  // NetworkError.message es un code interno (network_unreachable /
  // request_timeout), no texto para humanos.
  if (err instanceof NetworkError) return t("error_network");
  if (err instanceof Error) return err.message;
  return t("error_network");
}
