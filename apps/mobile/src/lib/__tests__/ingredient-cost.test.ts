// Per-ingredient cost lines in the recipe detail: which reason each status
// shows, where a tap leads, which product fields the fix sheet asks for, and
// the PATCH body the sheet sends.
import { describe, expect, it } from "vitest";
import { parsePezzatura, type RecipeCostLine } from "@atelier/shared";
import {
  buildFixPatch,
  currentPieceWeightG,
  fixFields,
  formatGrams,
  initialGramsPerLitre,
  isLinePressable,
  joinCostLines,
  lineAction,
  lineReason,
  parseGrams,
  pieceWeightInput,
  suggestGramsPerLitre,
  unitLabelKey,
  unitPairNeed,
  type FixProduct,
} from "../ingredient-cost";

function line(overrides: Partial<RecipeCostLine> = {}): RecipeCostLine {
  return {
    ingredientId: "ri-1",
    position: 0,
    status: "ok",
    costCents: 120,
    productId: "p-1",
    recipeUnit: "g",
    purchaseUnit: "kg",
    ...overrides,
  };
}

const unitName = (u: string) => `<${u}>`;

describe("lineReason", () => {
  it("has no reason for an ok line", () => {
    expect(lineReason(line(), unitName)).toBeNull();
  });

  it.each([
    ["no_product", "cost_line_no_product"],
    ["no_price", "cost_line_no_price"],
    ["no_quantity", "cost_line_no_quantity"],
    ["needs_density", "cost_line_needs_density"],
    ["needs_piece_weight", "cost_line_needs_piece_weight"],
    ["invalid_merma", "cost_line_invalid_merma"],
  ] as const)("maps %s to %s", (status, key) => {
    expect(lineReason(line({ status, costCents: null }), unitName)).toEqual({ key });
  });

  it("names both units for an incompatible pair", () => {
    expect(
      lineReason(line({ status: "incompatible_unit", recipeUnit: "piezas", purchaseUnit: "l" }), unitName),
    ).toEqual({
      key: "cost_line_incompatible_unit",
      vars: { recipeUnit: "<piezas>", purchaseUnit: "<l>" },
    });
  });
});

describe("unitLabelKey", () => {
  it("uses the app unit names, with piezas read as unidad", () => {
    expect(unitLabelKey("kg")).toBe("unit_kg");
    expect(unitLabelKey("ml")).toBe("unit_ml");
    expect(unitLabelKey("piezas")).toBe("unit_unidad");
    expect(unitLabelKey("unidad")).toBe("unit_unidad");
    expect(unitLabelKey("caja")).toBe("unit_caja");
    expect(unitLabelKey("cucharada")).toBeNull();
  });
});

describe("lineAction", () => {
  it.each([
    ["ok", null],
    ["no_product", "edit_recipe"],
    ["no_quantity", "edit_recipe"],
    ["invalid_merma", "product_detail"],
    ["no_price", "fix_sheet"],
    ["needs_density", "fix_sheet"],
    ["needs_piece_weight", "fix_sheet"],
    ["incompatible_unit", "fix_sheet"],
  ] as const)("sends %s to %s", (status, action) => {
    expect(lineAction(status)).toBe(action);
  });
});

describe("isLinePressable", () => {
  const all = { canManageProducts: true, canEditRecipe: true };

  it("is never pressable for an ok line", () => {
    expect(isLinePressable("ok", all)).toBe(false);
  });

  it("needs product permission for every fix", () => {
    for (const status of ["no_product", "no_price", "needs_density", "invalid_merma"] as const) {
      expect(isLinePressable(status, { canManageProducts: false, canEditRecipe: true })).toBe(false);
      expect(isLinePressable(status, all)).toBe(true);
    }
  });

  it("also needs recipe edit permission to open the recipe editor", () => {
    expect(isLinePressable("no_quantity", { canManageProducts: true, canEditRecipe: false })).toBe(false);
    expect(isLinePressable("no_price", { canManageProducts: true, canEditRecipe: false })).toBe(true);
  });

  it("needs a linked product for the product fixes", () => {
    expect(isLinePressable("no_price", all, null)).toBe(false);
    expect(isLinePressable("invalid_merma", all, null)).toBe(false);
    expect(isLinePressable("no_product", all, null)).toBe(true);
  });
});

describe("unitPairNeed", () => {
  it("needs nothing within one unit family", () => {
    expect(unitPairNeed("g", "kg")).toBe("none");
    expect(unitPairNeed("ml", "l")).toBe("none");
    expect(unitPairNeed("piezas", "unidad")).toBe("none");
    expect(unitPairNeed("caja", "caja")).toBe("none");
  });

  it("needs the weight of one litre between weight and volume", () => {
    expect(unitPairNeed("g", "l")).toBe("density");
    expect(unitPairNeed("ml", "kg")).toBe("density");
  });

  it("needs the weight of one piece between pieces and weight", () => {
    expect(unitPairNeed("unidad", "kg")).toBe("piece_weight");
    expect(unitPairNeed("g", "unidad")).toBe("piece_weight");
  });

  it("cannot convert pieces to volume, a box to anything else, or unknown units", () => {
    expect(unitPairNeed("piezas", "l")).toBe("incompatible");
    expect(unitPairNeed("g", "caja")).toBe("incompatible");
    expect(unitPairNeed("caja", "kg")).toBe("incompatible");
    expect(unitPairNeed("cucharada", "kg")).toBe("incompatible");
    expect(unitPairNeed(null, "kg")).toBe("incompatible");
  });
});

describe("fixFields", () => {
  const oil = { name: "Aceite de oliva", category: "vinagre_aceite" as const };
  const fish = { name: "Lubina", category: "pescado" as const };
  const pepper = { name: "Pimiento rojo", category: "verdura" as const };

  it("asks for the weight of one litre only for weight against volume", () => {
    expect(fixFields("g", "l", oil)).toEqual({
      density: true,
      pieceWeight: false,
      pieceWeightUnsupported: false,
      incompatible: false,
    });
    expect(fixFields("g", "kg", oil).density).toBe(false);
  });

  it("asks for the weight of one piece when the product admits a piece size", () => {
    expect(fixFields("g", "unidad", fish)).toEqual({
      density: false,
      pieceWeight: true,
      pieceWeightUnsupported: false,
      incompatible: false,
    });
  });

  it("says when the product cannot store a piece weight", () => {
    expect(fixFields("piezas", "kg", pepper)).toEqual({
      density: false,
      pieceWeight: false,
      pieceWeightUnsupported: true,
      incompatible: false,
    });
  });

  it("flags a pair that stays without cost", () => {
    expect(fixFields("piezas", "l", oil).incompatible).toBe(true);
  });
});

describe("weight of one litre suggestion", () => {
  it("suggests 920 g for oils and 1000 g for the rest", () => {
    expect(suggestGramsPerLitre("Aceite de oliva virgen extra")).toBe(920);
    expect(suggestGramsPerLitre("Olio EVO")).toBe(920);
    expect(suggestGramsPerLitre("Sunflower oil")).toBe(920);
    expect(suggestGramsPerLitre("Nata 35%")).toBe(1000);
    expect(suggestGramsPerLitre("Boiled ham")).toBe(1000);
  });

  it("prefills the stored value, or a visible suggestion when there is none", () => {
    expect(initialGramsPerLitre({ name: "Aceite", gramosPorLitro: 915.5 })).toEqual({ value: 915.5, suggested: false });
    expect(initialGramsPerLitre({ name: "Aceite", gramosPorLitro: null })).toEqual({ value: 920, suggested: true });
    expect(initialGramsPerLitre({ name: "Leche" })).toEqual({ value: 1000, suggested: true });
  });
});

describe("parseGrams / formatGrams", () => {
  it("reads a positive weight with comma or dot, rounded to 2 decimals", () => {
    expect(parseGrams("920")).toBe(920);
    expect(parseGrams(" 920,5 ")).toBe(920.5);
    expect(parseGrams("920.456")).toBe(920.46);
    expect(parseGrams("0,004")).toBeNull();
  });

  it("rejects empty, zero, negative, non-numeric and too large values", () => {
    for (const input of ["", "  ", "0", "-5", "abc", "100000"]) expect(parseGrams(input)).toBeNull();
  });

  it("formats with a decimal comma and no trailing zeros", () => {
    expect(formatGrams(920)).toBe("920");
    expect(formatGrams(920.5)).toBe("920,5");
    expect(formatGrams(33.33)).toBe("33,33");
  });
});

describe("piece weight", () => {
  it("writes grams per piece for products sized by piece weight", () => {
    const input = pieceWeightInput(60.5, "g_per_piece");
    expect(parsePezzatura(input, "pescado", "Lubina")).toEqual({ mode: "g_per_piece", min: 60.5, max: 60.5 });
  });

  it("writes pieces per kilo for shellfish, so the piece still weighs the same", () => {
    const input = pieceWeightInput(50, "pz_per_kg");
    expect(parsePezzatura(input, "pescado", "Gamberi rossi")).toEqual({ mode: "pz_per_kg", min: 20, max: 20 });
  });

  it("reads the current piece weight from the product size", () => {
    expect(currentPieceWeightG({ pezzaturaMode: "g_per_piece", pezzaturaMin: 400, pezzaturaMax: 600 })).toBe(500);
    expect(currentPieceWeightG({ pezzaturaMode: "pz_per_kg", pezzaturaMin: 20, pezzaturaMax: 20 })).toBe(50);
    expect(currentPieceWeightG({ pezzaturaMode: null, pezzaturaMin: null, pezzaturaMax: null })).toBeNull();
  });
});

describe("buildFixPatch", () => {
  const oilByLitre: FixProduct = {
    name: "Aceite de oliva",
    category: "vinagre_aceite",
    unidadCompra: "l",
    precioCompra: 500,
    gramosPorLitro: null,
    pezzaturaMode: null,
    pezzaturaMin: null,
    pezzaturaMax: null,
  };

  it("sends only the changed fields, with euros rounded to cents", () => {
    expect(
      buildFixPatch(oilByLitre, "g", { unit: "l", price: "5,256", gramsPerLitre: "920", pieceWeight: "" }),
    ).toEqual({ ok: true, patch: { precioCompra: 526, gramosPorLitro: 920 } });
  });

  it("sends nothing when nothing changed", () => {
    const product = { ...oilByLitre, gramosPorLitro: 920 };
    expect(buildFixPatch(product, "g", { unit: "l", price: "5", gramsPerLitre: "920", pieceWeight: "" })).toEqual({
      ok: true,
      patch: {},
    });
  });

  it("changes the purchase unit and skips the weight of one litre when it is no longer needed", () => {
    expect(
      buildFixPatch(oilByLitre, "g", { unit: "kg", price: "5,40", gramsPerLitre: "abc", pieceWeight: "" }),
    ).toEqual({ ok: true, patch: { unidadCompra: "kg", precioCompra: 540 } });
  });

  it("requires a price above zero", () => {
    for (const price of ["", "0", "-1", "x"]) {
      expect(buildFixPatch(oilByLitre, "g", { unit: "l", price, gramsPerLitre: "920", pieceWeight: "" })).toEqual({
        ok: false,
        error: "price",
      });
    }
  });

  it("requires a valid weight of one litre when it is needed", () => {
    expect(buildFixPatch(oilByLitre, "g", { unit: "l", price: "5", gramsPerLitre: "0", pieceWeight: "" })).toEqual({
      ok: false,
      error: "density",
    });
  });

  it("saves the weight of one piece as the product size", () => {
    const fish: FixProduct = {
      ...oilByLitre,
      name: "Lubina",
      category: "pescado",
      unidadCompra: "unidad",
      precioCompra: 1200,
    };
    expect(buildFixPatch(fish, "g", { unit: "unidad", price: "12", gramsPerLitre: "", pieceWeight: "450" })).toEqual({
      ok: true,
      patch: { pezzaturaInput: pieceWeightInput(450, "g_per_piece") },
    });
    expect(buildFixPatch(fish, "g", { unit: "unidad", price: "12", gramsPerLitre: "", pieceWeight: "" })).toEqual({
      ok: false,
      error: "piece_weight",
    });
  });

  it("keeps an unchanged piece weight out of the body", () => {
    const fish: FixProduct = {
      ...oilByLitre,
      name: "Lubina",
      category: "pescado",
      unidadCompra: "unidad",
      precioCompra: 1200,
      pezzaturaMode: "g_per_piece",
      pezzaturaMin: 450,
      pezzaturaMax: 450,
    };
    expect(buildFixPatch(fish, "g", { unit: "unidad", price: "12", gramsPerLitre: "", pieceWeight: "450" })).toEqual({
      ok: true,
      patch: {},
    });
  });
});

describe("joinCostLines", () => {
  const ingredients = [
    { id: "a", position: 0, rawText: "40 g aceite" },
    { id: "b", position: 1, rawText: "2 huevos" },
  ];

  it("returns null without lines, so the legacy list is shown", () => {
    expect(joinCostLines(undefined, ingredients)).toBeNull();
    expect(joinCostLines([], ingredients)).toBeNull();
  });

  it("joins each line to its ingredient by id, in line order", () => {
    const rows = joinCostLines(
      [line({ ingredientId: "b", position: 1 }), line({ ingredientId: "a", position: 0, status: "needs_density" })],
      ingredients,
    );
    expect(rows?.map((r) => [r.ingredient?.id, r.text, r.line.status])).toEqual([
      ["b", "2 huevos", "ok"],
      ["a", "40 g aceite", "needs_density"],
    ]);
  });

  it("falls back to the position when the id is unknown", () => {
    const rows = joinCostLines([line({ ingredientId: "1", position: 1 })], ingredients);
    expect(rows?.[0]?.ingredient?.id).toBe("b");
    expect(rows?.[0]?.text).toBe("2 huevos");
  });

  it("falls back to the legacy text when no ingredient matches", () => {
    const rows = joinCostLines([line({ ingredientId: "z", position: 3 })], ingredients, ["", "", "", "sal"]);
    expect(rows?.[0]).toMatchObject({ ingredient: null, text: "sal" });
  });
});
