import { describe, expect, it } from "vitest";
import {
  addIngredientRow,
  buildRecipeRequestBody,
  editIngredientText,
  ingredientMatchName,
  recipeIngredientPayload,
  selectIngredientProduct,
  toEditorIngredient,
} from "../recipe-editor";

describe("recipe editor costing data", () => {
  const original = { rawText: "2 piezas merluza", productId: "fish", qty: 2, unit: "piezas", pesoCalculoG: 450, mermaOverridePct: 12, pezzatura: "400-500 g" };
  it("retains quantity and unit when selecting a bank suggestion", () => {
    const selected = selectIngredientProduct({ rawText: "200g hari", productId: null }, { id: "flour", name: "Harina 00" });
    expect(recipeIngredientPayload(selected)).toMatchObject({ rawText: "200 g Harina 00", qty: 200, unit: "g", productId: "flour" });
  });
  it("preserves all structured fields through an unchanged edit and save", () => {
    expect(recipeIngredientPayload(editIngredientText(original, original.rawText))).toEqual(original);
  });
  it("updates quantity without losing the same product and its overrides", () => {
    expect(editIngredientText(original, "3 piezas merluza")).toEqual({ ...original, rawText: "3 piezas merluza", qty: 3, unit: "unidad" });
  });
  it("clears old product overrides when changing the ingredient", () => {
    expect(editIngredientText(original, "3 piezas patata")).toMatchObject({ productId: null, qty: 3, pesoCalculoG: null, mermaOverridePct: null });
  });
  it("keeps explicit quantities that cannot be parsed from text", () => {
    const value = { ...original, rawText: "merluza para el pase", qty: 0.75, unit: "kg" };
    expect(recipeIngredientPayload(value)).toEqual(value);
    expect(selectIngredientProduct(value, { id: "fish", name: "Merluza" })).toMatchObject({ qty: 0.75, unit: "kg", pesoCalculoG: 450 });
  });
});

describe("recipe editor standard format", () => {
  const rape = { rawText: "400 g rape limpio", productId: "rape", qty: 400, unit: "g", pesoCalculoG: null, mermaOverridePct: 8, section: "Pescado" };

  it("matches on the clean ingredient name, without quantity or note", () => {
    expect(ingredientMatchName("400 g rape limpio, muy frío")).toBe("rape limpio");
    expect(ingredientMatchName("4 calamares de 350 g aprox.")).toBe("calamar");
    expect(ingredientMatchName("  sal  ")).toBe("sal");
  });

  it("keeps the product and its overrides when only the note changes", () => {
    expect(editIngredientText(rape, "400 g rape limpio, muy frío")).toEqual({ ...rape, rawText: "400 g rape limpio, muy frío" });
  });

  it("drops the product when the clean name changes", () => {
    expect(editIngredientText(rape, "400 g rape, muy frío")).toMatchObject({ productId: null, mermaOverridePct: null, section: "Pescado" });
  });

  it("builds the canonical line when picking a product and keeps the note", () => {
    const picked = selectIngredientProduct({ rawText: "400 g rape, muy frío", productId: null }, { id: "rape", name: "Rape limpio" });
    expect(picked).toMatchObject({ rawText: "400 g Rape limpio, muy frío", qty: 400, unit: "g", productId: "rape" });
  });

  it("writes pieces as «ud» and decimals with a comma", () => {
    const pieces = selectIngredientProduct({ rawText: "2 piezas merluza", productId: null, qty: 2, unit: "piezas" }, { id: "fish", name: "Merluza" });
    expect(pieces).toMatchObject({ rawText: "2 ud Merluza", qty: 2, unit: "unidad" });
    const kilos = selectIngredientProduct({ rawText: "merluza", productId: null, qty: 0.75, unit: "kg" }, { id: "fish", name: "Merluza" });
    expect(kilos.rawText).toBe("0,75 kg Merluza");
  });

  it("keeps the piece weight written in the line when picking another product", () => {
    const picked = selectIngredientProduct({ rawText: "4 calamares de 350 g aprox.", productId: null }, { id: "squid", name: "Calamar" });
    expect(picked).toMatchObject({ rawText: "4 ud Calamar", qty: 4, unit: "unidad", pesoCalculoG: 350 });
  });

  it("prefills the editor with the display line, the section and no separate note", () => {
    const row = { rawText: "4 ud calamar", productId: "squid", qty: 4, unit: "unidad", pesoCalculoG: 350, section: "Fondo", note: "limpio" };
    expect(toEditorIngredient(row)).toEqual({ ...row, rawText: "4 ud calamar, limpio", note: null });
    expect(toEditorIngredient({ rawText: "sal" })).toEqual({ rawText: "sal", productId: null, pesoCalculoG: null, section: null, note: null });
  });

  it("does not repeat the note when the row is prefilled twice", () => {
    const once = toEditorIngredient({ rawText: "400 g rape limpio", productId: "rape", note: "muy frío" });
    expect(toEditorIngredient(once).rawText).toBe("400 g rape limpio, muy frío");
  });

  it("adds a new ingredient in the section of the last row", () => {
    const rows = [{ ...rape, section: "Fondo" }, { rawText: "sal", productId: null, section: "Salsa" }];
    expect(addIngredientRow(rows)).toEqual([...rows, { rawText: "", productId: null, section: "Salsa" }]);
    expect(addIngredientRow([])).toEqual([{ rawText: "", productId: null, section: null }]);
  });

  it("sends the section with each ingredient", () => {
    expect(recipeIngredientPayload({ rawText: " sal ", productId: null, section: "Salsa", note: null })).toEqual({ rawText: "sal", productId: null, section: "Salsa", note: null });
  });
});

describe("recipe editor request body", () => {
  const input = {
    title: "  Merluza al horno  ",
    portionsText: " 2 ",
    workingIngredients: [
      { rawText: "200 g merluza", productId: "fish", qty: 200, unit: "g", pesoCalculoG: 180, mermaOverridePct: 10 },
    ],
    method: ["  Preparar  ", "", "  Hornear  "],
    notes: "  Servir caliente  ",
    clientRequestId: "save-attempt",
    sourceConversationId: "conversation",
    origin: "import" as const,
    editId: null as string | null,
  };
  const content = {
    ingredients: ["200 g merluza"],
    method: ["Preparar", "Hornear"],
    notes: "Servir caliente",
  };
  const recipeIngredients = [{ ...input.workingIngredients[0] }];

  it("builds the imported create request without changing the editor state", () => {
    const before = structuredClone(input);
    expect(buildRecipeRequestBody(input)).toEqual({
      title: "Merluza al horno",
      portions: 2,
      contentJson: content,
      recipeIngredients,
      clientRequestId: "save-attempt",
      sourceConversationId: "conversation",
      origin: "import",
    });
    expect(input).toEqual(before);
  });

  it("omits origin for a manual create request", () => {
    expect(buildRecipeRequestBody({ ...input, portionsText: "", sourceConversationId: null, origin: null })).toEqual({
      title: "Merluza al horno",
      portions: null,
      contentJson: content,
      recipeIngredients,
      clientRequestId: "save-attempt",
    });
  });

  it("never sends origin when editing, even if an imported draft supplies it", () => {
    expect(buildRecipeRequestBody({ ...input, editId: "existing-recipe" })).toEqual({
      title: "Merluza al horno",
      portions: 2,
      contentJson: content,
      recipeIngredients,
      clientRequestId: "save-attempt",
      sourceConversationId: "conversation",
    });
  });
});
