// Lightweight i18n hook for Phase 0. The full reactive context lands later;
// for now we keep the language in module state so the ProfileSheet can flip
// it and force a re-render via the registered listeners.

import { useCallback, useEffect, useState } from "react";
import { t as translate, type Language, type TranslationKey } from "@atelier/i18n";

let currentLang: Language = "es";
const listeners = new Set<(lang: Language) => void>();

function setLang(lang: Language) {
  currentLang = lang;
  listeners.forEach((l) => l(lang));
}

export function useI18n() {
  const [lang, setLocalLang] = useState<Language>(currentLang);

  useEffect(() => {
    listeners.add(setLocalLang);
    return () => {
      listeners.delete(setLocalLang);
    };
  }, []);

  // Memoize `t` so consumers can safely put it in useEffect deps.
  // Without this, `t` is a fresh closure every render and any effect that
  // lists `t` as a dep re-runs on every render — which, for one-shot
  // effects like magic-link verify, causes the operation to fire twice.
  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) =>
      translate(key, lang, vars),
    [lang],
  );

  return { lang, setLang, t };
}
