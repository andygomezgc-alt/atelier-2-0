import { describe, expect, it, vi } from "vitest";

// `chat-error.ts` reuses the code→key table from `api-error.ts`, which imports
// `@/src/api/client` → `expo-secure-store` (native module).
vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => undefined),
  deleteItemAsync: vi.fn(async () => undefined),
}));

import { t } from "@atelier/i18n";
import { ApiErrorCodeSchema, isRetryableChatError } from "@atelier/shared";
import { classifyChatError } from "../chat-error";
import { ApiError, NetworkError } from "@/src/api/client";
import { StreamInterruptedError, StreamTimeoutError } from "@/src/api/conversations";

const tStub = ((key: string) => `[${key}]`) as never;
const stream = (code?: string, status?: number, message = code ?? "stream_error") =>
  new StreamInterruptedError(message, "", code as never, undefined, status);

describe("classifyChatError (A3)", () => {
  it("translates every closed code through the shared table and the shared retry rule", () => {
    const special = new Set(["chat_in_progress", "ai_creative_limit", "chat_refused", "chat_context_too_long"]);
    for (const code of ApiErrorCodeSchema.options) {
      const failure = classifyChatError(stream(code), tStub, "daily");
      expect(failure.message, code).toMatch(/^\[[a-z_]+\]$/);
      expect(failure.message, code).not.toBe("[undefined]");
      if (!special.has(code)) expect(failure.retryable, code).toBe(isRetryableChatError(code));
    }
  });

  it.each([
    ["ai_rate_limited", "[error_ai_rate_limited]", true],
    ["ai_daily_weekly_limit", "[ai_daily_weekly_limit]", false],
    ["chat_in_progress", "[chat_in_progress]", true],
    ["chat_request_conflict", "[chat_request_conflict]", false],
    ["forbidden", "[error_forbidden]", false],
    ["ai_provider_unconfigured", "[ai_provider_unconfigured]", false],
  ] as const)("%s → %s, retryable %s, no action", (code, message, retryable) => {
    expect(classifyChatError(stream(code), tStub, "creative")).toEqual({ message, retryable });
  });

  it("offers the daily model for the creative weekly limit", () => {
    expect(classifyChatError(stream("ai_creative_limit"), tStub, "creative")).toEqual({
      message: "[ai_creative_limit]", retryable: false, action: "use_daily",
    });
  });

  it("offers the daily model for a creative refusal only", () => {
    expect(classifyChatError(stream("chat_refused"), tStub, "creative")).toEqual({
      message: "[error_chat_refused]", retryable: false, action: "use_daily",
    });
    expect(classifyChatError(stream("chat_refused"), tStub, "daily")).toEqual({
      message: "[error_chat_refused]", retryable: false,
    });
  });

  it("offers a new chat when the conversation is too long", () => {
    expect(classifyChatError(stream("chat_context_too_long"), tStub, "daily")).toEqual({
      message: "[error_chat_context_too_long]", retryable: false, action: "new_chat",
    });
  });

  // A3b — the transport already signs out on a 401; the banner only explains it.
  it("explains an expired session on a 401 from the stream or from apiFetch, without retry or action", () => {
    const expected = { message: "[error_session_expired]", retryable: false };
    expect(classifyChatError(stream(undefined, 401, '{"error":"Unauthorized"}'), tStub, "daily")).toEqual(expected);
    expect(classifyChatError(new ApiError(401, "Unauthorized"), tStub, "daily")).toEqual(expected);
  });

  it("does not offer a retry for a 403 without code", () => {
    expect(classifyChatError(new ApiError(403, "Forbidden"), tStub, "daily")).toEqual({ message: "[error_forbidden]", retryable: false });
    expect(classifyChatError(stream(undefined, 403, "stream_error_403"), tStub, "daily")).toEqual({ message: "[error_forbidden]", retryable: false });
  });

  it("reads coded HTTP errors from createConversation like stream codes", () => {
    expect(classifyChatError(new ApiError(429, "Too many", "ai_daily_chat_limit"), tStub, "daily")).toEqual({
      message: "[ai_daily_chat_limit]", retryable: false,
    });
  });

  it.each([
    ["network loss", new NetworkError()],
    ["request timeout", new NetworkError("request_timeout")],
    ["stream inactivity", new StreamTimeoutError("partial")],
    ["native XHR text", stream(undefined, 0, "The Internet connection appears to be offline.")],
    ["transport error without status", stream(undefined, undefined, "Failed to connect to /10.0.2.2:3000")],
  ])("%s → generic network message, retryable", (_label, error) => {
    expect(classifyChatError(error, tStub, "daily")).toEqual({ message: "[error_network]", retryable: true });
  });

  it.each([
    ["5xx without code", stream(undefined, 502, "stream_error_502")],
    ["JSON body without code", stream(undefined, 500, '{"error":"Internal"}')],
    ["HTTP 500 without code", new ApiError(500, "HTTP 500")],
    ["unknown error", new Error("something private from a provider")],
    ["non-error value", "boom"],
  ])("%s → generic provider message, retryable", (_label, error) => {
    expect(classifyChatError(error, tStub, "daily")).toEqual({ message: "[error_ai_provider_failed]", retryable: true });
  });

  it("never shows raw err.message text, in any language", () => {
    for (const language of ["es", "en", "it"] as const) {
      const translate = (key: Parameters<typeof t>[0]) => t(key, language);
      for (const error of [
        new Error("Internal provider detail"),
        stream(undefined, 0, "Software caused connection abort"),
        stream(undefined, 502, '{"error":"Bad gateway"}'),
        new ApiError(400, "Raw server text"),
      ]) {
        const { message } = classifyChatError(error, translate, "daily");
        expect(message).not.toMatch(/Internal provider|Software caused|Bad gateway|Raw server|_/);
        expect(message.trim()).toBeTruthy();
      }
    }
  });

  it("falls back to a legacy message that is itself a known code", () => {
    expect(classifyChatError(new Error("ai_daily_weekly_limit"), tStub, "daily")).toEqual({
      message: "[ai_daily_weekly_limit]", retryable: false,
    });
  });
});
