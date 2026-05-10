import { apiFetch } from "./client";
import * as SecureStore from "expo-secure-store";
import { TOKEN_KEY } from "./client";
import EventSource from "react-native-sse";

const BASE = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

const STREAM_INACTIVITY_MS = 35_000;

export class StreamTimeoutError extends Error {
  constructor() {
    super("stream_timeout");
    this.name = "StreamTimeoutError";
  }
}

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
 * Parses a single SSE `data:` payload string. Returns a typed event or `null`
 * if the payload is non-JSON (e.g. heartbeats). Exported for unit testing —
 * the streaming transport is owned by `react-native-sse`, but the wire-format
 * understanding stays here so we can verify it without spinning up RN.
 */
export type SseEvent =
  | { type: "delta"; text: string }
  | { type: "done" }
  | { type: "error"; message: string };

export function parseSseEvent(data: string): SseEvent | null {
  try {
    const json = JSON.parse(data);
    if (json && typeof json === "object") {
      if (json.type === "delta" && typeof json.text === "string") {
        return { type: "delta", text: json.text };
      }
      if (json.type === "done") return { type: "done" };
      if (json.type === "error") {
        return { type: "error", message: typeof json.message === "string" ? json.message : "stream_error" };
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Streams an assistant response over SSE. React Native's global `fetch` does
 * not expose `Response.body` as a readable stream (Hermes returns null), so we
 * use `react-native-sse` (XHR-backed) which works on Android/iOS and web.
 * Calls `onDelta` for each text fragment, resolves with the full text on done.
 */
export async function streamMessage(
  conversationId: string,
  content: string,
  model: "sonnet" | "opus",
  onDelta: (delta: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);

  return new Promise<string>((resolve, reject) => {
    let inactivityTimer: ReturnType<typeof setTimeout> | null = null;
    let full = "";
    let settled = false;
    let timedOut = false;
    let aborted = false;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const es = new EventSource(`${BASE}/api/conversations/${conversationId}/messages`, {
      method: "POST",
      headers,
      body: JSON.stringify({ content, model }),
      // We manage inactivity ourselves — disable the lib's auto-reconnect.
      pollingInterval: 0,
    });

    const cleanup = () => {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      inactivityTimer = null;
      es.removeAllEventListeners();
      es.close();
    };

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };

    const resetInactivityTimer = () => {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(() => {
        timedOut = true;
        settle(() => reject(new StreamTimeoutError()));
      }, STREAM_INACTIVITY_MS);
    };

    resetInactivityTimer();

    if (signal) {
      if (signal.aborted) {
        aborted = true;
        settle(() => reject(new DOMException("aborted", "AbortError")));
        return;
      }
      const onAbort = () => {
        aborted = true;
        settle(() => reject(new DOMException("aborted", "AbortError")));
      };
      signal.addEventListener("abort", onAbort, { once: true });
    }

    es.addEventListener("message", (event) => {
      resetInactivityTimer();
      if (!event.data) return;
      const ev = parseSseEvent(event.data);
      if (!ev) return;
      if (ev.type === "delta") {
        full += ev.text;
        onDelta(ev.text);
      } else if (ev.type === "done") {
        settle(() => resolve(full));
      } else if (ev.type === "error") {
        settle(() => reject(new Error(ev.message)));
      }
    });

    es.addEventListener("error", (event) => {
      // The lib emits "error" both on transport failures and when the server
      // closes the stream cleanly (xhrState === 4). If we already accumulated
      // text and the connection just ended, treat it as a successful end.
      if (timedOut || aborted) return; // already settled
      const ev = event as { type: string; message?: string; xhrStatus?: number };
      if (ev.type === "error" && full.length > 0) {
        settle(() => resolve(full));
      } else {
        const msg = ev.message ?? `stream_error${ev.xhrStatus ? `_${ev.xhrStatus}` : ""}`;
        settle(() => reject(new Error(msg)));
      }
    });
  });
}
