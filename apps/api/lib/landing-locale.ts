// Picks the landing language from the visitor's IP country (Vercel's x-vercel-ip-country
// header), unless they already chose one with the language selector.
export const LANDING_LOCALES = ["it", "es", "en"] as const;
export type LandingLocale = (typeof LANDING_LOCALES)[number];

export const LANDING_LOCALE_COOKIE = "atelier_lang";
export const DEFAULT_LANDING_LOCALE: LandingLocale = "it";

const ITALIAN = new Set(["IT", "SM", "VA"]);
const SPANISH = new Set([
  "ES", "AR", "BO", "CL", "CO", "CR", "CU", "DO", "EC", "GQ", "GT", "HN",
  "MX", "NI", "PA", "PE", "PR", "PY", "SV", "UY", "VE",
]);

export function isLandingLocale(value: unknown): value is LandingLocale {
  return typeof value === "string" && (LANDING_LOCALES as readonly string[]).includes(value);
}

export function landingLocale({ country, saved }: { country?: string | null; saved?: string | null }): LandingLocale {
  if (isLandingLocale(saved)) return saved;
  const code = country?.toUpperCase();
  if (!code) return DEFAULT_LANDING_LOCALE;
  if (ITALIAN.has(code)) return "it";
  if (SPANISH.has(code)) return "es";
  return "en";
}
