import { describe, expect, it } from "vitest";
import { normalizeChatMode } from "./ai-models";
import { PostMessageRequestSchema, PatchMeRequestSchema } from "./api-contract";
describe("chat modes and old APK compatibility", () => {
  it.each(["daily", "creative", "haiku", "sonnet", "opus"])("accepts %s selections", model => {
    expect(PostMessageRequestSchema.safeParse({ content: "Hola", model }).success).toBe(true);
    expect(PatchMeRequestSchema.safeParse({ defaultModel: model }).success).toBe(true);
    expect(normalizeChatMode(model)).toBe(["creative", "opus"].includes(model) ? "creative" : "daily");
  });
  it("does not allow clients to choose arbitrary provider model IDs", () => {
    expect(PostMessageRequestSchema.safeParse({ content: "Hola", model: "glm-5.3-flash" }).success).toBe(false);
    expect(normalizeChatMode(null)).toBe("daily");
  });
});
