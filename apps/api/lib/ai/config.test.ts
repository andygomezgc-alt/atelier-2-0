import { afterEach, describe, expect, it, vi } from "vitest";
import { aiConfig, chatConfig, providerKey } from "./config";
afterEach(() => vi.unstubAllEnvs());
describe("AI routing configuration", () => {
  it.each(["daily", "haiku", "sonnet", undefined] as const)("routes %s to Gemini", mode => {
    expect(chatConfig(mode)).toMatchObject({ provider: "gemini", model: "gemini-3.8-flash" });
  });
  it.each(["creative", "opus"] as const)("routes %s to Opus", mode => {
    expect(chatConfig(mode)).toMatchObject({ provider: "anthropic", model: "claude-opus-5" });
  });
  it("routes all background tasks to GLM with bounded budgets", () => {
    for (const task of ["extraction", "menuStyle", "menuTheme", "memory"] as const) {
      expect(aiConfig(task)).toMatchObject({ provider: "zai", model: "glm-5.3-flash" });
      expect(aiConfig(task).maxTokens).toBeLessThanOrEqual(16384);
    }
  });
  it("upgrades models through server configuration without changing mobile mode IDs", () => {
    vi.stubEnv("AI_CHAT_DAILY_MODEL", "gemini-next");
    vi.stubEnv("AI_GLM_MODEL", "glm-next");
    vi.stubEnv("AI_MENU_THEME_MODEL", "glm-design");
    expect(chatConfig("sonnet").model).toBe("gemini-next");
    expect(aiConfig("memory").model).toBe("glm-next");
    expect(aiConfig("menuTheme").model).toBe("glm-design");
  });
  it("rejects invalid model IDs and never substitutes another provider's key", () => {
    vi.stubEnv("AI_CHAT_DAILY_MODEL", "../../other?key=x");
    expect(() => chatConfig()).toThrow("configuration_invalid");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "configured");
    expect(() => providerKey("gemini")).toThrow("ai_provider_unconfigured");
  });
});
