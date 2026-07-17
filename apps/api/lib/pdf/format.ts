// Helpers de formato compartidos por las rutas de export (PDF/CSV de recetas
// y productos). Antes vivían copiados idénticos en cada route.ts.

import type { Language } from "@atelier/i18n";

export const LANGS: readonly Language[] = ["es", "it", "en"];

// Precio en centavos → euros con coma decimal (formato es/it): 3200 → "32,00".
export function formatEuro(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

export function formatDate(lang: Language): string {
  const locale = lang === "es" ? "es-ES" : lang === "it" ? "it-IT" : "en-GB";
  try {
    return new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}
