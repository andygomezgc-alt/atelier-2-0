import { describe, test, expect } from "vitest";
import { renderElegant, PRICE } from "./templates";
import type { Allergen } from "@atelier/shared";

const baseDish = {
  name: "Tagliatelle al ragù bianco",
  description: "Pasta fresca con ragú de cerdo",
  price: 2400,
  allergens: [] as Allergen[],
};

const baseInput = {
  restaurantName: "Koko",
  menuName: "Verano 2026",
  season: null,
  sections: [{ name: "Primi", dishes: [{ ...baseDish }] }],
  unsectioned: [],
  showAllergensInPdf: true,
  allergenLegendTitle: "ALÉRGENOS",
  allergenLabels: {
    gluten: "Gluten",
    crustaceans: "Crustáceos",
    eggs: "Huevos",
    fish: "Pescado",
    peanuts: "Cacahuetes",
    soy: "Soja",
    milk: "Lácteos",
    tree_nuts: "Frutos de cáscara",
    celery: "Apio",
    mustard: "Mostaza",
    sesame: "Sésamo",
    sulphites: "Sulfitos",
    lupin: "Altramuces",
    molluscs: "Moluscos",
  } as Record<Allergen, string>,
};

describe("PDF templates — Fase 2 alérgenos", () => {
  test("los precios conservan céntimos y dos decimales como la carta de referencia", () => {
    expect(PRICE(1250)).toBe("12,50 €");
    expect(PRICE(1299)).toBe("12,99 €");
    expect(PRICE(1200)).toBe("12,00 €");
    expect(PRICE(0)).toBe("0,00 €");
    expect(renderElegant({ ...baseInput, unsectioned: [{ ...baseDish, price: 1250 }] })).toContain("12,50 €");
  });
  test("imprime precios por kg y cargos sin recetas ni alérgenos", () => {
    const html = renderElegant({ ...baseInput, sections: [], unsectioned: [{ ...baseDish, name: "Pesce", price: 6000, priceSuffix: "/ kg" }],
      serviceCharges: [{ name: "Coperto", price: 400, description: "", allergens: [], priceSuffix: "a persona" }] });
    expect(html).toContain("60,00 € / kg"); expect(html).toContain("4,00 € a persona");
    expect(html).toContain("Coperto"); expect(html).not.toContain('<div class="legend">');
  });
  test("sin alérgenos y toggle ON → NO renderea .dish-allergens ni .legend", () => {
    const html = renderElegant(baseInput);
    expect(html).not.toContain('<div class="dish-allergens">');
    expect(html).not.toContain('<div class="legend">');
    expect(html).not.toContain("ALÉRGENOS");
  });

  test("con alérgenos y toggle ON → renderea SVG por plato y leyenda con SVG + label", () => {
    const html = renderElegant({
      ...baseInput,
      sections: [
        {
          name: "Primi",
          dishes: [{ ...baseDish, allergens: ["gluten", "eggs"] }],
        },
      ],
    });
    // Iconos por plato: bloque .dish-allergens con SVGs inline.
    expect(html).toContain('<div class="dish-allergens">');
    expect(html).toContain("<svg ");
    // Leyenda al pie con title + items (icono + label).
    expect(html).toContain('<div class="legend">');
    expect(html).toContain("ALÉRGENOS");
    expect(html).toContain('class="legend-item"');
    expect(html).toContain("Gluten");
    expect(html).toContain("Huevos");
  });

  test("con alérgenos pero toggle OFF → NO renderea nada de alérgenos", () => {
    const html = renderElegant({
      ...baseInput,
      showAllergensInPdf: false,
      sections: [
        {
          name: "Primi",
          dishes: [{ ...baseDish, allergens: ["gluten", "eggs"] }],
        },
      ],
    });
    expect(html).not.toContain('<div class="dish-allergens">');
    expect(html).not.toContain('<div class="legend">');
    expect(html).not.toContain("ALÉRGENOS");
    // El plato sigue rendereándose.
    expect(html).toContain("Tagliatelle al ragù bianco");
  });

  test("leyenda dedup: alérgeno en 2 platos aparece 1 vez en leyenda", () => {
    const html = renderElegant({
      ...baseInput,
      sections: [
        {
          name: "Primi",
          dishes: [
            { ...baseDish, name: "Plato A", allergens: ["gluten", "eggs"] },
            { ...baseDish, name: "Plato B", allergens: ["gluten", "milk"] },
          ],
        },
      ],
    });
    // 3 items en la leyenda (gluten + eggs + milk, NO 4).
    const itemMatches = html.match(/class="legend-item"/g) ?? [];
    expect(itemMatches.length).toBe(3);
    // Y los 3 labels presentes.
    expect(html).toContain(">Gluten<");
    expect(html).toContain(">Huevos<");
    expect(html).toContain(">Lácteos<");
  });

  test("iconos del plato y de la leyenda salen del MISMO cálculo (no divergen)", () => {
    const html = renderElegant({
      ...baseInput,
      sections: [
        {
          name: "Primi",
          dishes: [{ ...baseDish, allergens: ["fish", "tree_nuts"] }],
        },
      ],
    });
    // Iconos en el plato: 2 SVGs en .dish-allergens
    const dishBlock = html.match(/<div class="dish-allergens">[\s\S]*?<\/div>/)?.[0] ?? "";
    const dishSvgs = (dishBlock.match(/<svg /g) ?? []).length;
    expect(dishSvgs).toBe(2);

    // Iconos en la leyenda: 2 items (mismo set).
    const legendItems = (html.match(/class="legend-item"/g) ?? []).length;
    expect(legendItems).toBe(2);
    expect(html).toContain(">Pescado<");
    expect(html).toContain(">Frutos de cáscara<");
  });

  test("layout: body flex column + .legend con margin-top auto (anclada al pie)", () => {
    const html = renderElegant({
      ...baseInput,
      sections: [
        {
          name: "Primi",
          dishes: [{ ...baseDish, allergens: ["milk"] }],
        },
      ],
    });
    // CSS del body con flex column.
    expect(html).toMatch(/body\s*{[^}]*display:\s*flex/);
    expect(html).toMatch(/body\s*{[^}]*flex-direction:\s*column/);
    // Legend con margin-top: auto + flex: 0 0 auto.
    expect(html).toMatch(/\.legend\s*{[^}]*margin-top:\s*auto/);
  });
});
