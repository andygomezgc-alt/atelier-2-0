// A10c — builds the ordered items uploaded with the local history (promoteChat keeps chunking and the bulk call).
import { MESSAGE_CONTENT_MAX } from "@atelier/shared";

export type HistoryUploadSource = {
  id: string;
  role: "user" | "assistant";
  content: string;
  clientMessageId?: string | null;
};

export type HistoryUploadItem = {
  role: "user" | "assistant";
  content: string;
  clientMessageId: string;
};

const MAX_CLIENT_MESSAGE_ID = 64;

// Deterministic 64-bit hash (cyrb53) rendered as 16 hex characters, keeping derived ids short.
function hashLocalId(value: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
}

// A message without its own clientMessageId still needs a stable one: short local ids are kept as they are,
// long ones are hashed into a separate namespace so they stay within the schema limit.
function derivedClientMessageId(localId: string): string {
  const readable = `local:${localId}`;
  return readable.length <= MAX_CLIENT_MESSAGE_ID ? readable : `localh:${hashLocalId(localId)}`;
}

// Clamps to the limit without splitting a surrogate pair: an emoji straddling the limit is dropped whole.
function clampContent(content: string): string {
  if (content.length <= MESSAGE_CONTENT_MAX) return content;
  const cut = content.slice(0, MESSAGE_CONTENT_MAX);
  const last = cut.charCodeAt(cut.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;
}

// Ordered upload items for the local history. Empty messages are skipped (the schema refuses them), every
// item gets a clientMessageId, and ids already stored are left out so a retry resumes where it stopped.
export function buildHistoryUpload(history: HistoryUploadSource[], storedIds: ReadonlySet<string>): HistoryUploadItem[] {
  const items: HistoryUploadItem[] = [];
  for (const message of history) {
    if (!message.content.trim()) continue;
    const clientMessageId = message.clientMessageId || derivedClientMessageId(message.id);
    if (storedIds.has(clientMessageId)) continue;
    items.push({ role: message.role, content: clampContent(message.content), clientMessageId });
  }
  return items;
}
