import { es, type EsDict } from "./es";
import { it } from "./it";
import { en } from "./en";

export type Language = "es" | "it" | "en";
export type TranslationKey = keyof EsDict;

const DICTS: Record<Language, EsDict> = { es, it, en };

export function t(
  key: TranslationKey,
  lang: Language = "es",
  vars: Record<string, string | number> = {},
): string {
  const dict = DICTS[lang] ?? es;
  let value: string = dict[key] ?? es[key] ?? key;
  for (const [name, replacement] of Object.entries(vars)) {
    value = value.replaceAll(`{${name}}`, String(replacement));
  }
  return value;
}

export { es, it, en };
