// "Tu estilo" fiel — registro de fuentes embebibles para el theme HTML/CSS
// generado. render.ts bloquea CUALQUIER request de red (incluidas webfonts), así
// que las familias se sirven como @font-face con `src: url(data:font/woff2;base64,
// ...)` — el woff2 va inline en el HTML. Subsets latin (400 + 700 + italic-400 si
// la familia lo trae), commiteados en lib/pdf/fonts/*.woff2 (~13-25KB c/u).
//
// Los ids (FONT_IDS) viven en @atelier/shared (el Zod del theme los valida); acá
// está el registro real con family/fallback/archivos. Un test valida que las
// claves de FONT_REGISTRY coincidan con FONT_IDS de shared.

import { readFileSync } from "fs";
import { join } from "path";
import { FONT_IDS, type FontId } from "@atelier/shared";

type FontFile = { weight: 400 | 700; style: "normal" | "italic"; file: string };

type FontEntry = {
  // Nombre EXACTO de la familia CSS que el modelo debe usar en el theme.css.
  family: string;
  fallback: "serif" | "sans-serif" | "cursive";
  // Una línea descriptiva para el catálogo del prompt de generación.
  blurb: string;
  files: FontFile[];
};

// f() arma el nombre de archivo con la convención de @fontsource:
//   <id>-latin-<weight>-<style>.woff2
const f = (id: FontId, weight: 400 | 700, style: "normal" | "italic"): FontFile => ({
  weight,
  style,
  file: `${id}-latin-${weight}-${style}.woff2`,
});

export const FONT_REGISTRY: Record<FontId, FontEntry> = {
  "playfair-display": {
    family: "Playfair Display",
    fallback: "serif",
    blurb: "serif display elegante de alto contraste, ideal para títulos de carta refinada",
    files: [f("playfair-display", 400, "normal"), f("playfair-display", 700, "normal"), f("playfair-display", 400, "italic")],
  },
  "cormorant-garamond": {
    family: "Cormorant Garamond",
    fallback: "serif",
    blurb: "serif fina y estilizada, aire clásico y editorial",
    files: [f("cormorant-garamond", 400, "normal"), f("cormorant-garamond", 700, "normal"), f("cormorant-garamond", 400, "italic")],
  },
  "eb-garamond": {
    family: "EB Garamond",
    fallback: "serif",
    blurb: "serif garalde tradicional, muy legible en cuerpos de texto",
    files: [f("eb-garamond", 400, "normal"), f("eb-garamond", 700, "normal"), f("eb-garamond", 400, "italic")],
  },
  "libre-baskerville": {
    family: "Libre Baskerville",
    fallback: "serif",
    blurb: "serif transicional robusta, buena para menús densos",
    files: [f("libre-baskerville", 400, "normal"), f("libre-baskerville", 700, "normal"), f("libre-baskerville", 400, "italic")],
  },
  cinzel: {
    family: "Cinzel",
    fallback: "serif",
    blurb: "serif de capiteles romanos en mayúsculas, para títulos de lujo (sin cursiva)",
    files: [f("cinzel", 400, "normal"), f("cinzel", 700, "normal")],
  },
  montserrat: {
    family: "Montserrat",
    fallback: "sans-serif",
    blurb: "sans geométrica moderna, limpia y versátil",
    files: [f("montserrat", 400, "normal"), f("montserrat", 700, "normal"), f("montserrat", 400, "italic")],
  },
  lato: {
    family: "Lato",
    fallback: "sans-serif",
    blurb: "sans humanista cálida, muy legible",
    files: [f("lato", 400, "normal"), f("lato", 700, "normal"), f("lato", 400, "italic")],
  },
  oswald: {
    family: "Oswald",
    fallback: "sans-serif",
    blurb: "sans condensada de fuerte presencia, para títulos compactos (sin cursiva)",
    files: [f("oswald", 400, "normal"), f("oswald", 700, "normal")],
  },
  "dancing-script": {
    family: "Dancing Script",
    fallback: "cursive",
    blurb: "manuscrita cursiva fluida, acento decorativo (usar con moderación)",
    files: [f("dancing-script", 400, "normal"), f("dancing-script", 700, "normal")],
  },
};

// Directorio de los woff2 relativo al cwd de la función serverless. Mismo patrón
// que loadSystemPrompt en lib/anthropic.ts (join(process.cwd(), "lib", ...)),
// que ya funciona en Vercel.
const FONTS_DIR = join(process.cwd(), "lib", "pdf", "fonts");

// Cache por archivo: los woff2 no cambian en runtime, evitamos leer+base64 en
// cada render.
const base64Cache = new Map<string, string>();
function fileBase64(file: string): string {
  const cached = base64Cache.get(file);
  if (cached) return cached;
  const b64 = readFileSync(join(FONTS_DIR, file)).toString("base64");
  base64Cache.set(file, b64);
  return b64;
}

function fontFaceBlock(family: string, ff: FontFile): string {
  const data = fileBase64(ff.file);
  return `@font-face{font-family:'${family}';font-style:${ff.style};font-weight:${ff.weight};font-display:swap;src:url(data:font/woff2;base64,${data}) format('woff2');}`;
}

// Emite los @font-face (con el woff2 inline en base64) de las familias pedidas.
// Ids repetidos o nulos se ignoran. El theme.css referencia las familias por su
// nombre exacto (FONT_REGISTRY[id].family).
export function fontFaceCss(ids: Array<FontId | null | undefined>): string {
  const seen = new Set<FontId>();
  const blocks: string[] = [];
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const entry = FONT_REGISTRY[id];
    if (!entry) continue;
    for (const ff of entry.files) blocks.push(fontFaceBlock(entry.family, ff));
  }
  return blocks.join("\n");
}

// Re-export para consumidores del server (prompt de generación, tests).
export { FONT_IDS, type FontId };
