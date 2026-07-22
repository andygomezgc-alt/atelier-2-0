import { apiFetch } from "./client";
import * as SecureStore from "@/src/lib/secure-storage";
import { TOKEN_KEY } from "./client";
import EventSource from "react-native-sse";

const BASE = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

const STREAM_INACTIVITY_MS = 35_000;

export class StreamInterruptedError extends Error {
  constructor(
    message: string,
    readonly partialText: string,
  ) {
    super(message);
    this.name = "StreamInterruptedError";
  }
}

export class StreamTimeoutError extends StreamInterruptedError {
  constructor(partialText = "") {
    super("stream_timeout", partialText);
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

export const createConversation = (body: { ideaId?: string | null; modelUsed: "haiku" | "sonnet" | "opus" }) =>
  apiFetch<{ id: string }>("/api/conversations", {
    method: "POST",
    body: JSON.stringify(body),
  });

export const listConversations = () =>
  apiFetch<ConversationSummary[]>("/api/conversations");

export const listMessages = (conversationId: string) =>
  apiFetch<ChatMessage[]>(`/api/conversations/${conversationId}/messages`);

// A-12 — hidrata mensajes locales (modo preview) en una Conversation real
// recién creada. Lo usa `saveAsRecipe` en Asistente cuando el chef pasa de
// needs-restaurant → signed-in.
export const bulkAddMessages = (
  conversationId: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
) =>
  apiFetch<{ inserted: number }>(
    `/api/conversations/${conversationId}/messages/bulk`,
    {
      method: "POST",
      body: JSON.stringify({ messages }),
    },
  );

export type IdeaConversation = {
  id: string;
  modelUsed: string;
  createdAt: string;
  messages: ChatMessage[];
};

/**
 * Get-or-create the (single) conversation tied to an idea, including all
 * messages. Each idea has exactly one conversation; calling this multiple
 * times always returns the same conversation with its full history.
 */
export const getConversationByIdea = (ideaId: string) =>
  apiFetch<IdeaConversation>(`/api/ideas/${ideaId}/conversation`);

/**
 * Parses a single SSE `data:` payload string. Returns a typed event or `null`
 * if the payload is non-JSON (e.g. heartbeats). Exported for unit testing —
 * the streaming transport is owned by `react-native-sse`, but the wire-format
 * understanding stays here so we can verify it without spinning up RN.
 */
export type SseEvent =
  | { type: "delta"; text: string }
  | { type: "heartbeat"; ts: number }
  | { type: "done" }
  | { type: "error"; message: string };

export function parseSseEvent(data: string): SseEvent | null {
  try {
    const json = JSON.parse(data);
    if (json && typeof json === "object") {
      if (json.type === "delta" && typeof json.text === "string") {
        return { type: "delta", text: json.text };
      }
      // A-05 — el server manda heartbeats cada 8s mientras espera el primer
      // delta del modelo. Le decimos al cliente "sigo vivo" sin generar texto;
      // el cliente resetea su inactivity timer pero NO lo expone como delta.
      if (json.type === "heartbeat" && typeof json.ts === "number") {
        return { type: "heartbeat", ts: json.ts };
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
 *
 * A-12 — `conversationId` puede ser `null`: el cliente apunta al endpoint
 * compartido pero con segmento "preview", donde el server stremea sin
 * persistir y usa `history` del body como contexto. La firma para el chef
 * (UX, estados) es idéntica al modo persistente.
 */
export async function streamMessage(
  conversationId: string | null,
  content: string,
  model: "haiku" | "sonnet" | "opus",
  onDelta: (delta: string) => void,
  signal?: AbortSignal,
  history?: Array<{ role: "user" | "assistant"; content: string }>,
  clientMessageId?: string,
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

    const pathSegment = conversationId ?? "preview";
    const body: Record<string, unknown> = { content, model };
    if (!conversationId && history) body.history = history;
    if (clientMessageId) body.clientMessageId = clientMessageId;

    const es = new EventSource(`${BASE}/api/conversations/${pathSegment}/messages`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
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
        settle(() => reject(new StreamTimeoutError(full)));
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
      } else if (ev.type === "heartbeat") {
        // A-05 — el resetInactivityTimer ya se llamó arriba; no hace falta
        // más nada. Mantiene viva la conexión cuando el modelo tarda en
        // empezar a generar.
      } else if (ev.type === "done") {
        settle(() => resolve(full));
      } else if (ev.type === "error") {
        settle(() => reject(new StreamInterruptedError(ev.message, full)));
      }
    });

    es.addEventListener("error", (event) => {
      if (timedOut || aborted) return; // already settled
      const ev = event as { type: string; message?: string; xhrStatus?: number };
      const msg = ev.message || `stream_error${ev.xhrStatus ? `_${ev.xhrStatus}` : ""}`;
      settle(() => reject(new StreamInterruptedError(msg, full)));
    });
  });
}
