export class MenuFontValidationError extends Error {
  constructor(issues: readonly string[]) {
    super(`Fuentes del PDF no disponibles: ${issues.join("; ")}. Usá familias y variantes reales del catálogo.`);
    this.name = "MenuFontValidationError";
  }
}

export type FontVariant = { family: string; weight: number; style: string };

// Se ejecuta en Chromium mediante page.evaluate. No depende de variables del
// servidor ni habilita los scripts del documento que estamos imprimiendo.
export async function inspectDocumentFonts(variants: FontVariant[] | null): Promise<string[]> {
  await document.fonts.ready;
  const issues = new Set<string>();
  // Evitar funciones locales nombradas: tsx/esbuild puede introducir helpers
  // externos (__name) que no existen al serializar la función para Chromium.
  for (const face of Array.from(document.fonts)) {
    if (face.status === "error") issues.add(`falló cargar ${face.family.slice(0, 60)} ${face.weight} ${face.style}`);
  }
  if (!variants) return [...issues];
  const generics = new Set(["serif", "sans-serif", "cursive", "monospace", "fantasy", "system-ui"]);
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const checked = new Set<string>();
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const element = node.parentElement;
    if (!element || !node.textContent?.trim() || ["STYLE", "SCRIPT"].includes(element.tagName)) continue;
    const style = getComputedStyle(element);
    const range = document.createRange();
    range.selectNodeContents(node);
    if (!range.getClientRects().length || style.visibility === "hidden" || style.display === "none") continue;
    const family = style.fontFamily.split(",")[0]!.trim().replace(/^['"]|['"]$/g, "").toLowerCase();
    if (generics.has(family)) continue;
    const key = `${family} ${style.fontWeight} ${style.fontStyle}`;
    if (checked.has(key)) continue;
    checked.add(key);
    if (!variants.some(face => face.family.trim().replace(/^['"]|['"]$/g, "").toLowerCase() === family)) {
      issues.add(`familia no declarada ${family.slice(0, 60)}`);
    } else if (!variants.some(face => face.family.trim().replace(/^['"]|['"]$/g, "").toLowerCase() === family && face.weight === Number(style.fontWeight) && face.style === style.fontStyle)) {
      issues.add(`variante no disponible ${key.slice(0, 100)}`);
    }
    if (issues.size >= 12) break;
  }
  return [...issues];
}
