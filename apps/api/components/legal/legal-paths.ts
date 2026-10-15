import type { Metadata } from "next";
import type { LandingLocale } from "@/lib/landing-locale";

// The Spanish legal pages keep their original URLs: the mobile app and the stores link to them.
// Italian and English live under /it and /en.
export const LEGAL_PAGE_LOCALES = ["it", "en"] as const;
export type LegalPageLocale = (typeof LEGAL_PAGE_LOCALES)[number];

export type LegalPaths = { privacy: string; terms: string; deleteAccount: string };

export const SPANISH_LEGAL_PATHS: LegalPaths = {
  privacy: "/privacidad",
  terms: "/terminos",
  deleteAccount: "/cuenta/eliminar",
};

export function isLegalPageLocale(value: unknown): value is LegalPageLocale {
  return typeof value === "string" && (LEGAL_PAGE_LOCALES as readonly string[]).includes(value);
}

export function legalPaths(locale: LandingLocale): LegalPaths {
  if (locale === "es") return SPANISH_LEGAL_PATHS;
  return { privacy: `/${locale}/privacy`, terms: `/${locale}/terms`, deleteAccount: `/${locale}/delete-account` };
}

// hreflang alternates for one legal page, with Spanish at its original URL.
export function legalAlternates(page: keyof LegalPaths) {
  return {
    es: SPANISH_LEGAL_PATHS[page],
    ...Object.fromEntries(LEGAL_PAGE_LOCALES.map((locale) => [locale, legalPaths(locale)[page]])),
  };
}

// Metadata of a translated legal page: its own title and description, canonical URL and alternates.
export function legalMetadata(page: keyof LegalPaths, lang: LegalPageLocale, text: { title: string; description: string }): Metadata {
  return {
    ...text,
    metadataBase: new URL("https://ateliercocina.com"),
    alternates: { canonical: legalPaths(lang)[page], languages: legalAlternates(page) },
  };
}
