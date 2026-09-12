/** Stable product modes; provider/model versions live only on the server. */
export type ChatMode = "daily" | "creative";
export type ChatModelSelection = ChatMode | "haiku" | "sonnet" | "opus";

/** Existing accounts and older APKs keep working after the provider migration. */
export function normalizeChatMode(value: unknown): ChatMode {
  return value === "creative" || value === "opus" ? "creative" : "daily";
}
