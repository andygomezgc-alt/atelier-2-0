// A3 — classifies a failed chat send for the banner in the Asistente: the
// translated reason (never the raw `err.message`), whether Retry can help, and
// an optional action that solves it in another way.

import { ApiErrorCodeSchema, isRetryableChatError, type ApiErrorCode, type ChatMode } from "@atelier/shared";
import type { TranslationKey } from "@atelier/i18n";
import { apiErrorKey } from "./api-error";

type T = (key: TranslationKey, vars?: Record<string, string | number>) => string;

export type ChatErrorAction = "use_daily" | "new_chat";

export type ChatFailure = {
  message: string;
  retryable: boolean;
  action?: ChatErrorAction;
};

// Structural read: ApiError (createConversation via apiFetch), NetworkError and
// StreamInterruptedError (SSE) all arrive here without importing the transport.
function readError(err: unknown): { code?: ApiErrorCode; status?: number; name?: string } {
  if (!(err instanceof Error)) return {};
  const fields = err as Error & { code?: unknown; status?: unknown };
  const status = typeof fields.status === "number" ? fields.status : undefined;
  // Older servers sent the code as the message.
  const code = ApiErrorCodeSchema.safeParse(fields.code ?? err.message);
  return { code: code.success ? code.data : undefined, status, name: err.name };
}

export function classifyChatError(err: unknown, t: T, model: ChatMode): ChatFailure {
  const { code, status, name } = readError(err);
  // The transport (apiFetch / streamMessage) already signed out; only explain why.
  if (status === 401) return { message: t("error_session_expired"), retryable: false };
  if (code) {
    const message = t(apiErrorKey(code) ?? "error_ai_provider_failed");
    if (code === "ai_creative_limit" || (code === "chat_refused" && model === "creative")) {
      return { message, retryable: false, action: "use_daily" };
    }
    if (code === "chat_context_too_long") return { message, retryable: false, action: "new_chat" };
    // The other send of this conversation finishes on its own; retrying later works.
    if (code === "chat_in_progress") return { message, retryable: true };
    return { message, retryable: isRetryableChatError(code) };
  }
  if (status === 403) return { message: t("error_forbidden"), retryable: false };
  // No HTTP response at all: connection lost, inactivity timeout, native XHR text.
  const streamFailure = name === "StreamInterruptedError" || name === "StreamTimeoutError";
  if (name === "NetworkError" || (streamFailure && !status)) return { message: t("error_network"), retryable: true };
  return { message: t("error_ai_provider_failed"), retryable: true };
}
