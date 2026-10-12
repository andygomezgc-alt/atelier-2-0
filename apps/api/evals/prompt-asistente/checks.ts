// Comprobaciones deterministas de la prueba del prompt del asistente. Puras: sin red ni disco.

export type Lang = "es" | "it" | "en";

// Palabras frecuentes y propias de cada idioma. Se dejan fuera las compartidas
// (la, del, con, una, in...) para que no inclinen la cuenta.
const STOPWORDS: Record<Lang, ReadonlySet<string>> = {
  es: new Set(["el", "los", "las", "de", "para", "que", "y", "en", "es", "por", "pero", "muy", "más", "está", "están", "sin", "como", "hasta", "cuando", "también", "porque", "este", "esta", "esto", "cada", "sobre", "entre"]),
  it: new Set(["il", "gli", "di", "della", "delle", "dello", "degli", "dei", "nel", "nella", "nelle", "alla", "alle", "per", "che", "è", "sono", "molto", "più", "non", "anche", "questo", "questa", "perché", "quando", "ma", "senza", "poi", "ogni", "sul", "sulla"]),
  en: new Set(["the", "and", "with", "for", "you", "your", "is", "are", "of", "to", "it", "this", "that", "from", "until", "into", "or", "be", "on", "at", "by", "if", "then", "when", "each"]),
};

/** Idioma por recuento de palabras propias; "unknown" si gana por poco (menos de 3 o menos del doble que el segundo). */
export function detectLanguage(text: string): Lang | "unknown" {
  const words = text.normalize("NFC").toLowerCase().match(/\p{L}+/gu) ?? [];
  const counts = (Object.keys(STOPWORDS) as Lang[])
    .map(lang => ({ lang, hits: words.filter(word => STOPWORDS[lang].has(word)).length }))
    .sort((a, b) => b.hits - a.hits);
  const [best, second] = counts;
  if (!best || best.hits < 3 || best.hits < 2 * (second?.hits ?? 0)) return "unknown";
  return best.lang;
}

// Copia exacta de completeRecipe en apps/mobile/src/lib/recipe-conversation.ts
// (líneas 6-9): mide lo que de verdad reconoce «Guardar receta».
export function recipeDetected(text: string): boolean {
  return /(?:^|\n)\s*[#*\d.\s-]*(?:ingredientes|ingredienti|ingredients)\b/imu.test(text)
    && /(?:^|\n)\s*[#*\d.\s-]*(?:procedimiento|procedimento|preparazione|elaboración|preparación|método|method|preparation|pasos)\b/imu.test(text);
}

const INGREDIENTS_HEADING = /^\s*[#*\d.\s-]*(?:ingredientes|ingredienti|ingredients)\b/iu;
// Más amplio que el detector: también corta en títulos que no acepta (como
// «Metodo»), para no contar los pasos como ingredientes; eso ya lo mide recipeDetected.
const METHOD_HEADING = /^\s*[#*\d.\s-]*(?:procedimiento|procedimento|preparazione|elaborazione|elaboración|preparación|método|metodo|method|preparation|procedure|instructions|directions|steps|pasos)\b/iu;
const LIST_ITEM = /^\s*(?:[-*•]|\d+[.)])\s+(.+)$/u;
const FULLY_BOLD = /^(?:\*\*[^*]+\*\*|__[^_]+__):?$/u;
const indent = (line: string) => (/^\s*/.exec(line)?.[0] ?? "").replace(/\t/g, "    ").length;

/** Líneas de la lista de ingredientes y fracción que empieza por la cantidad («8 g sal fina», no «Sal fina, 8 g»). */
export function quantityFirstShare(text: string): { lines: number; share: number } {
  const all = text.split(/\r?\n/);
  const start = all.findIndex(line => INGREDIENTS_HEADING.test(line));
  if (start < 0) return { lines: 0, share: 0 };
  const section = all.slice(start + 1);
  const end = section.findIndex(line => METHOD_HEADING.test(line));
  const body = end < 0 ? section : section.slice(0, end);
  let lines = 0;
  let quantityFirst = 0;
  body.forEach((line, index) => {
    const raw = LIST_ITEM.exec(line)?.[1]?.trim();
    if (!raw) return;
    const item = raw.replace(/^[*_\s]+|[*_\s]+$/g, "");
    const next = body.slice(index + 1).find(candidate => candidate.trim());
    const hasSubItems = next !== undefined && LIST_ITEM.test(next) && indent(next) > indent(line);
    // Las etiquetas de grupo («Para el caldo:», en negrita entera o con subítems) no son ingredientes.
    if (!item || item.endsWith(":") || FULLY_BOLD.test(raw) || hasSubItems) return;
    lines++;
    if (/^[\d½¼¾]/u.test(item)) quantityFirst++;
  });
  return { lines, share: lines ? quantityFirst / lines : 0 };
}

/** Un bloque ```json en cualquier parte, el bloque <recipe_payload> o un objeto/array JSON al final del texto. */
export function hasHiddenJson(text: string): boolean {
  if (/```\s*json\b/i.test(text) || /<recipe_payload>/i.test(text)) return true;
  // Un JSON final dentro de un bloque de código sin lenguaje también cuenta.
  const body = text.trimEnd().replace(/\n```$/, "");
  if (!/[}\]]$/.test(body)) return false;
  for (const match of body.matchAll(/^[ \t]*[{[]/gm)) {
    try {
      const value: unknown = JSON.parse(body.slice((match.index ?? 0) + match[0].length - 1));
      if (value !== null && typeof value === "object") return true;
    } catch {
      // Desde aquí no hay un JSON que llegue hasta el final.
    }
  }
  return false;
}

export type DeterministicGrades = { idioma: 0 | 1; titulos: 0 | 1 | null; cantidad: 0 | 1 | null; sin_json: 0 | 1 };

/** Las notas deterministas de una respuesta; titulos y cantidad solo existen en los casos de receta. */
export function deterministicGrades(answer: string, kase: { lang: Lang; recipe: boolean }): DeterministicGrades {
  const quantities = quantityFirstShare(answer);
  return {
    idioma: detectLanguage(answer) === kase.lang ? 1 : 0,
    titulos: kase.recipe ? (recipeDetected(answer) ? 1 : 0) : null,
    // Con menos de 3 ingredientes no hay lista que medir: null, para no contarlo como un fallo de formato.
    cantidad: kase.recipe && quantities.lines >= 3 ? (quantities.share >= 0.8 ? 1 : 0) : null,
    sin_json: hasHiddenJson(answer) ? 0 : 1,
  };
}

/** Palabras separadas por espacios que tienen al menos una letra o un número (las viñetas no cuentan). */
export function wordCount(text: string): number {
  return text.split(/\s+/).filter(token => /[\p{L}\p{N}]/u.test(token)).length;
}
