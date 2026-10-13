import { normalizeChatMode, type ChatModelSelection } from "@atelier/shared";

export type AiProvider = "anthropic" | "gemini" | "zai";
export type AiTask = "daily" | "creative" | "chatSummary" | "extraction" | "menuStyle" | "menuTheme" | "memory";
export type AiEffort = "low" | "medium" | "high" | "xhigh" | "max";
// effort only applies to Anthropic calls; no production task sets it, so chat.ts falls back to its default.
export type AiConfig = { task: AiTask; provider: AiProvider; model: string; maxTokens: number; timeoutMs: number; effort?: AiEffort };

const DEFAULTS = {
  daily: { provider: "gemini", model: "gemini-3.8-flash", env: "AI_CHAT_DAILY_MODEL", maxTokens: 8192, timeoutMs: 240_000 },
  creative: { provider: "anthropic", model: "claude-opus-5-5", env: "AI_CHAT_CREATIVE_MODEL", maxTokens: 16384, timeoutMs: 240_000 },
  // Background summary of a Creativo chat's older messages. Diario summaries reuse the daily Gemini model.
  chatSummary: { provider: "anthropic", model: "claude-haiku-5-5", env: "AI_CHAT_SUMMARY_MODEL", maxTokens: 1024, timeoutMs: 30_000 },
  extraction: { provider: "zai", model: "glm-5.3-flash", env: "AI_EXTRACTION_MODEL", maxTokens: 8192, timeoutMs: 45_000 },
  menuStyle: { provider: "zai", model: "glm-5.3-flash", env: "AI_MENU_STYLE_MODEL", maxTokens: 4096, timeoutMs: 60_000 },
  menuTheme: { provider: "zai", model: "glm-5.3-flash", env: "AI_MENU_THEME_MODEL", maxTokens: 16384, timeoutMs: 80_000 },
  memory: { provider: "zai", model: "glm-5.3-flash", env: "CULINARY_MEMORY_MODEL", maxTokens: 8192, timeoutMs: 45_000 },
} as const;

export const PROVIDER_KEY_ENV: Record<AiProvider, string> = {
  anthropic: "ANTHROPIC_API_KEY", gemini: "GEMINI_API_KEY", zai: "ZAI_API_KEY",
};

export function aiConfig(task: AiTask): AiConfig {
  const defaults = DEFAULTS[task];
  const model = process.env[defaults.env]?.trim() ||
    (defaults.provider === "zai" ? process.env.AI_GLM_MODEL?.trim() : undefined) || defaults.model;
  // IDs are configuration, never supplied by a client or interpolated as URLs.
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(model)) throw new Error("ai_model_configuration_invalid");
  return { task, provider: defaults.provider, model, maxTokens: defaults.maxTokens, timeoutMs: defaults.timeoutMs };
}

export function chatConfig(selection?: ChatModelSelection) {
  return aiConfig(normalizeChatMode(selection));
}

export function providerKey(provider: AiProvider): string {
  const key = process.env[PROVIDER_KEY_ENV[provider]]?.trim();
  if (!key) throw new Error("ai_provider_unconfigured");
  return key;
}

export function providerConfigured(provider: AiProvider): boolean {
  return Boolean(process.env[PROVIDER_KEY_ENV[provider]]?.trim());
}
