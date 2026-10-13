import { describe, expect, it } from "vitest";
import { MenuDetailSchema, RecipeDetailSchema } from "@atelier/shared";
import {
  menuDetailInclude,
  projectMenuDetail,
  projectRecipeDetail,
  projectRecipeListItem,
  recipeDetailInclude,
  recipeListInclude,
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

describe("recipe cost lines", () => {
  type RecipeDetailRow = Parameters<typeof projectRecipeDetail>[0];
  // Prisma.Decimal stand-in: the projection only calls toString().
  const dec = (v: number) => ({ toString: () => String(v) });

  function product(id: string, unidadCompra: string, precioCompra: number, gramosPorLitro: number | null) {
    return {
      id,
      name: id,
      criticality: "media",
      estado: "activo",
      precioCompra,
      mermaPct: dec(0),
      unidadCompra,
      pezzaturaMode: null,
      pezzaturaMin: null,
      pezzaturaMax: null,
      gramosPorLitro: gramosPorLitro === null ? null : dec(gramosPorLitro),
      allergen: null,
      allergens: [],
      allergensReviewed: true,
    };
  }

  function ingredient(
    id: string,
    position: number,
    qty: number | null,
    unit: string | null,
    p: ReturnType<typeof product> | null,
  ) {
    return {
      id,
      position,
      rawText: id,
      qty: qty === null ? null : dec(qty),
      unit,
      pezzatura: null,
      mermaOverridePct: null,
      pesoCalculoG: null,
      product: p,
    };
  }

  function recipeRow(): RecipeDetailRow {
    return {
      id: "recipe-1",
      title: "Calamar embutido al pimentón",
      state: "approved",
      priority: false,
      version: 1,
      updatedAt: new Date("2026-10-12T10:00:00Z"),
      author: { name: "Chef", email: null },
      recipeIngredients: [
        ingredient("ri-oil", 0, 40, "g", product("p-oil", "l", 500, 920)),
        ingredient("ri-cream", 1, 100, "g", product("p-cream", "l", 400, null)),
        ingredient("ri-salt", 2, null, null, null),
      ],
      portions: 2,
      salePrice: null,
      manualAllergens: [],
      contentJson: { ingredients: [], method: [], notes: "" },
      approvedAt: null,
      sourceConversationId: null,
      approvedBy: null,
      menuItems: [],
    };
  }

  it("the detail exposes one line per ingredient with its status, in position order", () => {
    const detail = projectRecipeDetail(recipeRow());
    expect(detail.cost.lines).toEqual([
      { ingredientId: "ri-oil", position: 0, status: "ok", costCents: 22, productId: "p-oil", recipeUnit: "g", purchaseUnit: "l" },
      { ingredientId: "ri-cream", position: 1, status: "needs_density", costCents: null, productId: "p-cream", recipeUnit: "g", purchaseUnit: "l" },
      { ingredientId: "ri-salt", position: 2, status: "no_product", costCents: null, productId: null, recipeUnit: null, purchaseUnit: null },
    ]);
    expect(detail.cost).toMatchObject({ totalCents: 22, computableCount: 1, unmeasuredCount: 1, unlinkedCount: 1 });
    expect(RecipeDetailSchema.safeParse(detail).success).toBe(true);
  });

  it("the list item stays small: no lines and no cost object", () => {
    const item = projectRecipeListItem(recipeRow());
    expect(item).not.toHaveProperty("cost");
    expect(JSON.stringify(item)).not.toContain("lines");
    // The weight-per-litre conversion still reaches the list's per-portion cost.
    expect(item.perPortionCents).toBe(11);
  });

  it("the detail returns each ingredient's section and note (null when unset)", () => {
    const row = recipeRow();
    row.recipeIngredients[0] = { ...row.recipeIngredients[0]!, section: "Aceite de chorizo", note: "en frío" };
    row.recipeIngredients[1] = { ...row.recipeIngredients[1]!, section: null, note: null };
    const detail = projectRecipeDetail(row);
    expect(detail.recipeIngredients.map(({ section, note }) => ({ section, note }))).toEqual([
      { section: "Aceite de chorizo", note: "en frío" },
      { section: null, note: null },
      { section: null, note: null },
    ]);
    expect(RecipeDetailSchema.safeParse(detail).success).toBe(true);
  });

  it("list and detail includes select the product's weight per litre", () => {
    expect(recipeDetailInclude.recipeIngredients.include.product.select.gramosPorLitro).toBe(true);
    expect(recipeListInclude.recipeIngredients.include.product.select.gramosPorLitro).toBe(true);
  });

  it("a product in the trash does not count in the cost: the line is unlinked", () => {
    const row = recipeRow();
    row.recipeIngredients[0] = {
      ...row.recipeIngredients[0]!,
      product: { ...product("p-oil", "l", 500, 920), deletedAt: new Date("2026-10-13T10:00:00Z") },
    };
    const detail = projectRecipeDetail(row);
    expect(detail.cost.lines?.[0]).toMatchObject({ ingredientId: "ri-oil", status: "no_product", costCents: null, productId: null });
    expect(detail.cost).toMatchObject({ totalCents: null, computableCount: 0, unlinkedCount: 2 });
    expect(projectRecipeListItem(row).perPortionCents).toBeNull();
  });

  it("list and detail includes select the product's trash date", () => {
    expect(recipeDetailInclude.recipeIngredients.include.product.select.deletedAt).toBe(true);
    expect(recipeListInclude.recipeIngredients.include.product.select.deletedAt).toBe(true);
  });
});
