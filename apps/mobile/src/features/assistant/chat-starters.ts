// Starters shown in an empty chat: real brigade tasks. A tap only fills the composer;
// the chef completes the text and decides whether to send it.
import type { TranslationKey } from "@atelier/i18n";

export const CHAT_STARTER_KEYS = [
  "chat_starter_scale",
  "chat_starter_allergens",
  "chat_starter_substitute",
  "chat_starter_mise_en_place",
] as const satisfies readonly TranslationKey[];

export type ChatStarterKey = (typeof CHAT_STARTER_KEYS)[number];

/** The composer text for a starter: trimmed, with one trailing space so the chef keeps typing. */
export function starterDraft(text: string): string {
  return `${text.trimEnd()} `;
}
