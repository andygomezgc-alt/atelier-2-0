import type { TranslationKey } from "@atelier/i18n";
import type { ChatMessage } from "@/src/api/conversations";

export function createClientMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

// The history a send or a retry works from: answered turns, never the turn being sent.
export function historyBefore(list: ChatMessage[], pendingClientMessageId?: string): ChatMessage[] {
  return list.filter(
    (m) => (m.role === "user" || m.role === "assistant") && (!pendingClientMessageId || m.clientMessageId !== pendingClientMessageId),
  );
}

export function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

// Dictado por voz: app lang → BCP-47 del reconocedor nativo.
export const SPEECH_LANG: Record<"es" | "it" | "en", string> = {
  es: "es-ES",
  it: "it-IT",
  en: "en-US",
};

// Separador de día (pulido spec 2026-06-23): "hoy" / "ayer" / "12 jun".
export function dayLabel(
  iso: string,
  t: (k: TranslationKey) => string,
  locale: string,
): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const startOf = (x: Date) =>
      new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((startOf(now) - startOf(d)) / 86_400_000);
    if (diff <= 0) return t("day_today");
    if (diff === 1) return t("day_yesterday");
    // Idioma del chef, no el del teléfono.
    return d.toLocaleDateString(locale, { day: "numeric", month: "short" });
  } catch {
    return "";
  }
}
