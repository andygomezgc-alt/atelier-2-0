/** Ejecutar desde apps/api con tsx. --live habilita hasta tres análisis de IA.
 * Sin --live: solo Chromium y PDF.js, sin red ni datos de restaurantes reales.
 */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getDocumentProxy } from "unpdf";
import type { MenuCustomTheme } from "@atelier/shared";
import type { RenderInput } from "../lib/pdf/templates";
import { renderGeneratedTheme, validateThemeStructure } from "../lib/pdf/theme-render";
import { renderThemePreview } from "../lib/pdf/theme-preview";
import { fontVariants } from "../lib/pdf/fonts";
import { readReferenceGeometry } from "../lib/pdf/reference-geometry";
import { themeStressInput, requiredMenuContent } from "../lib/pdf/theme-stress-input";
import { generateMenuTheme } from "../lib/pdf/theme-generate";

const output = resolve("../../output/pdf/multi-restaurante");
const base: RenderInput = {
  restaurantName: "Bistró del Jardín", menuName: "Carta de temporada", season: null,
  sections: [
    { name: "Para empezar", dishes: [
      { name: "Tomates de temporada", description: "Albahaca, aceite de oliva y sal marina", price: 1250, allergens: [] },
      { name: "Crema de calabaza", description: "Semillas tostadas y hierbas frescas", price: 900, allergens: [] },
    ] },
    { name: "Principales", dishes: [
      { name: "Pescado al horno", description: "Verduras de temporada", price: 6000, priceSuffix: "/ kg", allergens: [] },
      { name: "Arroz de setas y verduras asadas", description: "Arroz, setas y caldo vegetal", price: 1850, allergens: [] },
    ] },
  ], unsectioned: [], serviceCharges: [], showAllergensInPdf: false,
  allergenLegendTitle: "Alérgenos", allergenLabels: {} as RenderInput["allergenLabels"],
};

const common = `body{font-size:11pt;color:#243128}h1{font-size:24pt;font-weight:400;margin:0 0 8mm}h2{font-size:14pt;font-weight:700;break-after:avoid;margin:6mm 0 3mm}.dish{display:flex;justify-content:space-between;gap:5mm;margin:0 0 5mm;break-inside:avoid}.dish>div{min-width:0}.price{white-space:nowrap;flex-shrink:0}.desc{font-size:9pt;margin:2mm 0}footer{margin-top:8mm;font-size:9pt}`;
const basic: MenuCustomTheme = {
  version: 1, fontTitle: "lato", fontBody: "lato", fontAccent: null,
  css: `@page{size:A5;margin:12mm}${common}`,
  frameHtml: '<main>{{CONTENT}}</main>',
  headerHtml: '<h1>{{RESTAURANT_NAME}}</h1><div>{{MENU_NAME}}</div>{{SEASON_HTML}}',
  sectionHeaderHtml: '<h2>{{SECTION_NAME}}</h2>',
  sectionHtml: '<section>{{SECTION_HEADER_HTML}}{{DISHES_HTML}}</section>',
  dishHtml: '<article class="dish"><div>{{DISH_NAME}}<p class="desc">{{DISH_DESC}}</p>{{ALLERGENS_HTML}}</div><span class="price">{{PRICE}}</span></article>',
  footerHtml: '<footer>{{RESTAURANT_NAME}}</footer>',
};

const cases = [
  { id: "bistro-a5", input: base, theme: basic },
  { id: "brasserie-horizontal", input: { ...base, restaurantName: "Brasserie du Port", menuName: "La carte / Menu" }, theme: {
    ...basic, fontTitle: "playfair-display" as const,
    css: `@page{size:A4 landscape;margin:16mm}${common}main{column-count:2;column-gap:14mm}h1{font-family:'Playfair Display',serif}section{break-inside:avoid}h2{border-bottom:1px solid #b88732;padding-bottom:2mm}`,
  } },
  { id: "cafe-oscuro", input: { ...base, restaurantName: "Café Nocturno", menuName: "Food & drinks" }, theme: {
    ...basic, fontTitle: "montserrat" as const,
    css: `@page{size:A4;margin:16mm}${common}html{background:#17252b}body{color:#fff}h1{font-family:Montserrat,sans-serif;color:#e4bd79}h2{color:#e4bd79}.dish{border-bottom:1px solid #617178;padding-bottom:4mm}`,
  } },
];

async function main() {
  const live = process.argv.includes("--live");
  await mkdir(output, { recursive: true });
  const results: object[] = [];
  for (const item of cases) {
    validateThemeStructure(item.theme);
    const variants = fontVariants([item.theme.fontTitle, item.theme.fontBody]);
    const reference = await renderThemePreview(renderGeneratedTheme(item.input, item.theme), requiredMenuContent(item.input), undefined, variants);
    await writeFile(resolve(output, `${item.id}-referencia.pdf`), reference);
    const doc = await getDocumentProxy(new Uint8Array(reference));
    const geometry = await readReferenceGeometry(doc); await doc.destroy();
    const stress = themeStressInput(item.input);
    const tested = await renderThemePreview(renderGeneratedTheme(stress, item.theme), requiredMenuContent(stress), geometry.pages[0], variants, 12);
    await writeFile(resolve(output, `${item.id}-contenido-variable.pdf`), tested);
    // La plantilla pasa con una carta corta pero pierde las secciones añadidas.
    const broken = { ...item.theme, css: item.theme.css + "section:nth-of-type(n+3){display:none}" };
    await renderThemePreview(renderGeneratedTheme(item.input, broken), requiredMenuContent(item.input));
    await assert.rejects(renderThemePreview(renderGeneratedTheme(stress, broken), requiredMenuContent(stress), undefined, variants, 12), /content_missing/);
    const result = { id: item.id, local: "passed", referencePages: geometry.pages.length, inputTokens: 0, outputTokens: 0, live: "not_run" };
    if (live) {
      // Tres referencias distintas, máximo dos llamadas de tema por referencia.
      const generated = await generateMenuTheme(reference, "application/pdf", {
        referenceGeometry: geometry,
        onUsage(input, output) { result.inputTokens += input; result.outputTokens += output; },
      });
      const pdf = await renderThemePreview(renderGeneratedTheme(item.input, generated.theme), requiredMenuContent(item.input), geometry.pages[0], fontVariants([generated.theme.fontTitle, generated.theme.fontBody, generated.theme.fontAccent]));
      await writeFile(resolve(output, `${item.id}-escaneado.pdf`), pdf);
      await writeFile(resolve(output, `${item.id}-theme.json`), JSON.stringify(generated, null, 2));
      result.live = "passed";
    }
    results.push(result);
    await writeFile(resolve(output, "resultados.json"), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(result));
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "failed"); process.exitCode = 1; });
