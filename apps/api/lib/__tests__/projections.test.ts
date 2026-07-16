import { describe, expect, it } from "vitest";
import { MenuDetailSchema } from "@atelier/shared";
import {
  menuDetailInclude,
  projectMenuDetail,
  recipeDetailInclude,
} from "../projections";

// Fixture SPEC válido — copiado de
// apps/api/app/api/restaurant/menu-style/from-image/__tests__/from-image.test.ts
const SPEC = {
  fontCategory: "serif",
  bgColor: "#f4efe4",
  inkColor: "#2b2b2b",
  accentColor: "#8a2432",
  headingColor: "#1d3a2f",
  frame: "single",
  titleAlign: "center",
  titleItalic: true,
  titleSizePt: 28,
  dividerStyle: "accent-rule",
  sectionCase: "uppercase",
  dishLayout: "row",
};

// Fila mínima que projectMenuDetail espera — solo lo necesario para no
// explotar (items/sections vacíos, sin clientOverride). MenuDetailRow no se
// exporta desde projections.ts, así que la tomamos del propio parámetro.
type MenuDetailRow = Parameters<typeof projectMenuDetail>[0];

function baseRow(restaurant: { menuStyleSpec: unknown } | null | undefined): MenuDetailRow {
  return {
    id: "menu-1",
    name: "Carta",
    season: null,
    presentationStyle: "elegant",
    inService: true,
    showAllergensInPdf: true,
    items: [],
    sections: [],
    clientOverride: null,
    restaurant,
  } as MenuDetailRow;
}

describe("projectMenuDetail — Tu estilo (menuStyleSpec)", () => {
  it("spec válido → menuStyleSpec igual al spec y hasCustomStyle true", () => {
    const result = projectMenuDetail(baseRow({ menuStyleSpec: SPEC }));
    expect(result.hasCustomStyle).toBe(true);
    expect(result.menuStyleSpec).toEqual(SPEC);
  });

  it("menuStyleSpec null → null / false", () => {
    const result = projectMenuDetail(baseRow({ menuStyleSpec: null }));
    expect(result.hasCustomStyle).toBe(false);
    expect(result.menuStyleSpec).toBeNull();
  });

  it("spec corrupto en DB → null / false (se comporta como sin estilo)", () => {
    const result = projectMenuDetail(baseRow({ menuStyleSpec: { bgColor: "not-a-hex" } }));
    expect(result.hasCustomStyle).toBe(false);
    expect(result.menuStyleSpec).toBeNull();
  });

  it("restaurant null/undefined → null / false", () => {
    expect(projectMenuDetail(baseRow(null)).hasCustomStyle).toBe(false);
    expect(projectMenuDetail(baseRow(null)).menuStyleSpec).toBeNull();
    expect(projectMenuDetail(baseRow(undefined)).hasCustomStyle).toBe(false);
    expect(projectMenuDetail(baseRow(undefined)).menuStyleSpec).toBeNull();
  });

  it("contrato end-to-end: el resultado con spec válido pasa MenuDetailSchema", () => {
    const result = projectMenuDetail(baseRow({ menuStyleSpec: SPEC }));
    const parsed = MenuDetailSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });
});

describe("etiquetas fantasma — includes filtran soft-deletes cruzados", () => {
  it("recipeDetailInclude.menuItems excluye menús en papelera", () => {
    expect(recipeDetailInclude.menuItems.where).toEqual({
      menuFolder: { deletedAt: null },
    });
  });

  it("menuDetailInclude.items excluye recetas en papelera", () => {
    expect(menuDetailInclude.items.where).toEqual({
      recipe: { deletedAt: null },
    });
  });
});
