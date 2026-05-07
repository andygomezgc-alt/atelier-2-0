import { apiFetch } from "./client";
import * as SecureStore from "expo-secure-store";
import { TOKEN_KEY } from "./client";

const BASE = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export type ConversationSummary = {
  id: string;
  modelUsed: string;
  ideaText: string | null;
  createdAt: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export const createConversation = (body: { ideaId?: string | null; modelUsed: "sonnet" | "opus" }) =>
  apiFetch<{ id: string }>("/api/conversations", {
    method: "POST",
    body: JSON.stringify(body),
  });

export const listMessages = (conversationId: string) =>
  apiFetch<ChatMessage[]>(`/api/conversations/${conversationId}/messages`);

/**
 * Streams an assistant response. Calls `onDelta` for each text fragment,
 * then resolves with the full text when the stream completes.
 */
export async function streamMessage(
  conversationId: string,
  content: string,
  model: "sonnet" | "opus",
  onDelta: (delta: string) => void,
): Promise<string> {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  const res = await fetch(`${BASE}/api/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ content, model }),
  });

  if (!res.ok || !res.body) {
    throw new Error(`HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let full = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    let idx = buf.indexOf("\n\n");
    while (idx !== -1) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);

      const line = chunk.split("\n").find((l) => l.startsWith("data: "));
      if (line) {
        try {
          const json = JSON.parse(line.slice(6));
          if (json.type === "delta" && typeof json.text === "string") {
            full += json.text;
            onDelta(json.text);
          } else if (json.type === "error") {
            throw new Error(json.message ?? "stream error");
          }
        } catch (e) {
          if (e instanceof Error && e.message !== "stream error") {
            // ignore JSON parse errors for non-data lines
          } else {
            throw e;
          }
        }
      }
      idx = buf.indexOf("\n\n");
    }
  }

  return full;
}
