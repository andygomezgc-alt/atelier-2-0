import { describe, test, expect } from "vitest";
import {
  renderGeneratedTheme,
  validateThemeStructure,
  ThemeValidationError,
} from "./theme-render";
import type { RenderInput } from "./templates";
import type { Allergen, MenuCustomTheme } from "@atelier/shared";

const LABELS = {
  gluten: "Glutine",
  crustaceans: "Crostacei",
  eggs: "Uova",
  fish: "Pesce",
  peanuts: "Arachidi",
  soy: "Soia",
  milk: "Latte",
  tree_nuts: "Frutta a guscio",
  celery: "Sedano",
  mustard: "Senape",
  sesame: "Sesamo",
  sulphites: "Solfiti",
  lupin: "Lupini",
  molluscs: "Molluschi",
} as Record<Allergen, string>;

const THEME: MenuCustomTheme = {
  version: 1,
  fontTitle: "playfair-display",
  fontBody: "lato",
  fontAccent: null,
  css: ".menu{color:#111}",
  frameHtml: '<div class="frame">{{CONTENT}}</div>',
  headerHtml: "<h1>{{RESTAURANT_NAME}} — {{MENU_NAME}}</h1>{{SEASON_HTML}}{{BOGUS_PLACEHOLDER}}",
  sectionHeaderHtml: '<div class="sect">{{SECTION_NAME}}</div>',
  dishHtml:
    '<div class="dish"><span class="n">{{DISH_NAME}}</span><span class="d">{{DISH_DESC}}</span><span class="p">{{PRICE}}</span>{{ALLERGENS_HTML}}</div>',
  footerHtml: "<footer>grazie</footer>",
};

function makeInput(over: Partial<RenderInput> = {}): RenderInput {
  return {
    restaurantName: "Trattoria",
    menuName: "Carta",
    season: "Autunno",
    sections: [
      {
        name: "Primi",
        dishes: [
          { name: "Tagliatelle", description: "ragù", price: 2400, allergens: ["gluten", "eggs"] },
        ],
      },
      {
        name: "Secondi",
        dishes: [
          { name: "Branzino", description: "al sale", price: 2600, allergens: ["fish", "milk"] },
        ],
      },
    ],
    unsectioned: [],
    showAllergensInPdf: true,
    allergenLegendTitle: "ALLERGENI",
    allergenLabels: LABELS,
    ...over,
  };
}

describe("renderGeneratedTheme", () => {
  test("escapa nombres/descripciones con <b>, & y comillas", () => {
    const html = renderGeneratedTheme(
      makeInput({
        sections: [
          {
            name: "Primi",
            dishes: [
              {
                name: 'Foie <b>gras</b> "deluxe" & co',
                description: "<i>x</i>",
                price: 3000,
                allergens: [],
              },
            ],
          },
        ],
      }),
      THEME,
    );
    expect(html).not.toContain("<b>gras</b>");
    expect(html).toContain("&lt;b&gt;gras&lt;/b&gt;");
    expect(html).toContain("&amp; co");
    expect(html).toMatch(/&quot;deluxe&quot;/);
    expect(html).toContain("&lt;i&gt;x&lt;/i&gt;");
  });

  test("elimina placeholders desconocidos que quedan sin reemplazar", () => {
    const html = renderGeneratedTheme(makeInput(), THEME);
    expect(html).not.toContain("{{BOGUS_PLACEHOLDER}}");
    expect(html).not.toContain("{{");
  });

  test("embebe las fuentes del theme como @font-face", () => {
    const html = renderGeneratedTheme(makeInput(), THEME);
    expect(html).toContain("@font-face");
    expect(html).toContain("font-family:'Playfair Display'");
    expect(html).toContain("font-family:'Lato'");
    expect(html).toContain("src:url(data:font/woff2;base64,");
  });

  test("frameHtml envuelve el contenido via {{CONTENT}}", () => {
    const html = renderGeneratedTheme(makeInput(), THEME);
    expect(html).toContain('<div class="frame">');
    // El header (dato interpolado) queda DENTRO del frame.
    const frameIdx = html.indexOf('<div class="frame">');
    const headerIdx = html.indexOf("<h1>Trattoria");
    expect(frameIdx).toBeGreaterThanOrEqual(0);
    expect(headerIdx).toBeGreaterThan(frameIdx);
  });

  test("leyenda al pie con la UNIÓN dedupada de alérgenos", () => {
    const html = renderGeneratedTheme(makeInput(), THEME);
    expect(html).toContain('class="allergen-legend"');
    expect(html).toContain("ALLERGENI");
    // Unión de {gluten,eggs} ∪ {fish,milk} = 4 items.
    const items = html.match(/class="allergen-legend-item"/g) ?? [];
    expect(items.length).toBe(4);
    expect(html).toContain("Glutine");
    expect(html).toContain("Uova");
    expect(html).toContain("Pesce");
    expect(html).toContain("Latte");
  });

  test("toggle OFF: sin leyenda ni iconos por plato", () => {
    const html = renderGeneratedTheme(makeInput({ showAllergensInPdf: false }), THEME);
    expect(html).not.toContain('class="allergen-legend"');
    expect(html).not.toContain('class="allergen-icons"');
    // Los platos siguen.
    expect(html).toContain("Tagliatelle");
    expect(html).toContain("Branzino");
  });

  test("precio con el formato de templates (entero + €)", () => {
    const html = renderGeneratedTheme(makeInput(), THEME);
    expect(html).toContain("24 €");
    expect(html).toContain("26 €");
  });

  test("sin frameHtml el contenido va directo al body", () => {
    const html = renderGeneratedTheme(makeInput(), { ...THEME, frameHtml: null });
    expect(html).not.toContain('<div class="frame">');
    expect(html).toContain("<h1>Trattoria");
    expect(html).toContain("<footer>grazie</footer>");
  });

  test("interpolación TOLERANTE: rescata camelCase/espacios y elimina leftovers de cualquier case", () => {
    const camelTheme: MenuCustomTheme = {
      ...THEME,
      frameHtml: '<div class="f">{{content}}</div>',
      headerHtml: "<h1>{{ restaurantName }} — {{menuName}}</h1>{{ SEASON_HTML }}{{tagline}}",
      sectionHeaderHtml: "<div>{{sectionName}}</div>",
      dishHtml: '<div>{{dishName}} — {{ price }} {{allergensHtml}}</div>',
      footerHtml: null,
    };
    const html = renderGeneratedTheme(makeInput(), camelTheme);
    // Datos rescatados pese al camelCase / espacios internos.
    expect(html).toContain("Trattoria — Carta");
    expect(html).toContain("Autunno"); // {{ SEASON_HTML }}
    expect(html).toContain("Tagliatelle"); // {{dishName}}
    expect(html).toContain("24 €"); // {{ price }}
    expect(html).toContain('<div class="f">'); // {{content}} envolvió
    // Leftover en minúsculas ({{tagline}}) eliminado — el regex viejo solo
    // borraba MAYÚSCULAS y lo dejaba como texto literal visible.
    expect(html).not.toContain("tagline");
    expect(html).not.toContain("{{");
  });
});

describe("validateThemeStructure", () => {
  test("theme válido no lanza", () => {
    expect(() => validateThemeStructure(THEME)).not.toThrow();
  });

  test("frameHtml sin {{CONTENT}} → ThemeValidationError (mensaje menciona CONTENT)", () => {
    expect(() =>
      validateThemeStructure({ ...THEME, frameHtml: "<div>{{HEADER}}{{SECTIONS}}{{FOOTER}}</div>" }),
    ).toThrow(ThemeValidationError);
    expect(() =>
      validateThemeStructure({ ...THEME, frameHtml: "<div>{{HEADER}}</div>" }),
    ).toThrow(/CONTENT/);
  });

  test("frameHtml null es válido (no exige {{CONTENT}})", () => {
    expect(() => validateThemeStructure({ ...THEME, frameHtml: null })).not.toThrow();
  });

  test("headerHtml sin MENU_NAME ni RESTAURANT_NAME → throw", () => {
    expect(() =>
      validateThemeStructure({ ...THEME, headerHtml: "<h1>{{tagline}}</h1>" }),
    ).toThrow(ThemeValidationError);
  });

  test("sectionHeaderHtml sin SECTION_NAME → throw", () => {
    expect(() =>
      validateThemeStructure({ ...THEME, sectionHeaderHtml: "<div>x</div>" }),
    ).toThrow(ThemeValidationError);
  });

  test("dishHtml sin DISH_NAME o sin PRICE → throw", () => {
    expect(() =>
      validateThemeStructure({ ...THEME, dishHtml: "<div>{{DISH_NAME}}</div>" }),
    ).toThrow(ThemeValidationError);
    expect(() =>
      validateThemeStructure({ ...THEME, dishHtml: "<div>{{PRICE}}</div>" }),
    ).toThrow(ThemeValidationError);
  });

  test("acepta camelCase (misma normalización que interpolate)", () => {
    expect(() =>
      validateThemeStructure({
        ...THEME,
        frameHtml: "<div>{{content}}</div>",
        headerHtml: "<h1>{{menuName}}</h1>",
        sectionHeaderHtml: "<div>{{sectionName}}</div>",
        dishHtml: "<div>{{dishName}} {{price}}</div>",
      }),
    ).not.toThrow();
  });
});
