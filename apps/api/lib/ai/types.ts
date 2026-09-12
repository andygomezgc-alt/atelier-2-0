export type AiUsage = {
  inputTokens: number;
  outputTokens: number; // Includes billed reasoning, never add reasoningTokens again.
  cachedTokens: number;
  reasoningTokens: number;
  cacheWriteTokens?: number; // Anthropic five-minute cache writes, already in inputTokens.
};
export type UsageCallback = (usage: AiUsage) => Promise<void> | void;
export type AiTextPart = { type: "text"; text: string };
export type AiImagePart = { type: "image_url"; image_url: { url: string } };
export type AiPart = AiTextPart | AiImagePart;

export function tokenCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export const emptyUsage = (): AiUsage => ({ inputTokens: 0, outputTokens: 0, cachedTokens: 0, reasoningTokens: 0 });
