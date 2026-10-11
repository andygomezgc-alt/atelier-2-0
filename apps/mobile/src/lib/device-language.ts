import { getLocales, type Locale } from "expo-localization";
import type { Language } from "@atelier/i18n";

type DeviceLocale = Pick<Locale, "languageCode"> & { languageTag: string | null };

const SUPPORTED_LANGUAGES: ReadonlySet<string> = new Set(["it", "es", "en"]);

export function resolveDeviceLanguage(locales: readonly DeviceLocale[]): Language {
  for (const locale of locales) {
    const code = (locale.languageCode || locale.languageTag?.split(/[-_]/)[0])?.toLowerCase();
    if (code && SUPPORTED_LANGUAGES.has(code)) return code as Language;
  }
  return "it";
}

export function getDeviceLanguage(): Language {
  try {
    return resolveDeviceLanguage(getLocales());
  } catch {
    return "it";
  }
}
