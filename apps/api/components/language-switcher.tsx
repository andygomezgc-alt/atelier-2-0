"use client";

import { LANDING_LOCALE_COOKIE, type LandingLocale } from "@/lib/landing-locale";

const options: { locale: LandingLocale; label: string; name: string }[] = [
  { locale: "it", label: "IT", name: "Italiano" },
  { locale: "es", label: "ES", name: "Español" },
  { locale: "en", label: "EN", name: "English" },
];

// Remembers the choice for a year so "/" stops following the IP country.
function remember(locale: LandingLocale) {
  document.cookie = `${LANDING_LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
}

export function LanguageSwitcher({ locale, className, label }: { locale: LandingLocale; className?: string; label: string }) {
  return (
    <nav className={className} aria-label={label}>
      {options.map((option) => (
        <a
          key={option.locale}
          href={`/${option.locale}`}
          hrefLang={option.locale}
          lang={option.locale}
          title={option.name}
          aria-current={option.locale === locale ? "page" : undefined}
          onClick={() => remember(option.locale)}
        >
          {option.label}
        </a>
      ))}
    </nav>
  );
}
