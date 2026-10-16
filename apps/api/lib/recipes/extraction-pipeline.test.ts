import { beforeEach, describe, expect, it, vi } from "vitest";

const { db } = vi.hoisted(() => ({ db: { product: { findMany: vi.fn() } } }));
vi.mock("@atelier/db", () => ({ prisma: db }));
// findMatch keeps its real behaviour; the spy shows what reaches it.
vi.mock("@/lib/products/matching", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/products/matching")>();
  return { ...actual, findMatch: vi.fn(actual.findMatch) };
});

import { findMatch, type MatchCandidate } from "@/lib/products/matching";
import type { ExtractedRecipe } from "@/lib/recipe-extraction";
import { loadMatchCandidates, standardizeExtractedRecipe } from "./extraction-pipeline";

const BANK: MatchCandidate[] = [
  { id: "p-aove", name: "AOVE", aliases: [] },
  { id: "p-chorizo", name: "Chorizo", aliases: [] },
  { id: "p-calamar", name: "Calamar", aliases: [] },
  { id: "p-rape", name: "Rape", aliases: [] },
];

const recipe = (ingredients: ExtractedRecipe["ingredients"]): ExtractedRecipe => ({
  title: "Calamar embutido al pimentón",
  portions: 16,
  ingredients,
  method: ["Limpia los calamares sin abrir los tubos.", "Calienta el aceite a 50 °C."],
  notes: "Servir templado.",
});

// The real GLM output: every preparation flattened into a suffix.
const FLATTENED = [
  "4 calamares de 350 g aprox. (tubos de 15–18 cm, sin roturas) (tripa)",
  "40 g AOVE (aceite de chorizo)",
  "10 g pimentón de la Vera dulce (aceite de chorizo)",
  "400 g rape limpio, muy frío (o merluza) (farsa)",
  "9 g sal fina (farsa)",
];

beforeEach(() => {
  vi.mocked(findMatch).mockClear();
  db.product.findMany.mockReset();
});

describe("loadMatchCandidates", () => {
  it("reads the restaurant's active and draft products", async () => {
    db.product.findMany.mockResolvedValue([{ id: "p1", name: "AOVE", aliases: ["aceite"] }]);
    expect(await loadMatchCandidates("rest-1")).toEqual([{ id: "p1", name: "AOVE", aliases: ["aceite"] }]);
    expect(db.product.findMany).toHaveBeenCalledWith({
      where: { restaurantId: "rest-1", deletedAt: null, estado: { in: ["activo", "borrador"] } },
      select: { id: true, name: true, aliases: true },
    });
  });

  it("without a restaurant there is nothing to match and no query", async () => {
    expect(await loadMatchCandidates("")).toEqual([]);
    expect(await loadMatchCandidates(null)).toEqual([]);
    expect(db.product.findMany).not.toHaveBeenCalled();
  });
});

describe("standardizeExtractedRecipe", () => {
  it("an ambiguous ingredient stays unlinked and out of pendingMatches", () => {
    vi.mocked(findMatch).mockReturnValueOnce({
      level: "ambiguo",
      productId: null,
      productName: null,
      distance: 0,
      candidates: [
        { id: "g1", name: "gambero rosso mazara cal.3", origen: "mazara", calibreLabel: "cal.3", precioCompra: null, unidadCompra: null },
        { id: "g2", name: "gambero rosso sicilia 15/20", origen: "sicilia", calibreLabel: "15/20", precioCompra: null, unidadCompra: null },
      ],
    });
    const { response } = standardizeExtractedRecipe(recipe(["200 g gambero rosso"]), BANK);
    expect(response.recipeIngredients[0]!.productId).toBeNull();
    expect(response.pendingMatches).toEqual([]);
  });

  it("keeps title, portions, method and notes", () => {
    const { response } = standardizeExtractedRecipe(recipe(["40 g AOVE"]), []);
    expect(response).toMatchObject({
      title: "Calamar embutido al pimentón",
      portions: 16,
      contentJson: { method: ["Limpia los calamares sin abrir los tubos.", "Calienta el aceite a 50 °C."], notes: "Servir templado." },
    });
  });

  it("flattened lines: the repeated suffix becomes the section, the rest a note, the name stays clean", () => {
    const { response } = standardizeExtractedRecipe(recipe(FLATTENED), BANK);
    expect(response.recipeIngredients).toEqual([
      { rawText: "4 ud calamar", productId: "p-calamar", qty: 4, unit: "unidad", section: "Tripa", note: "tubos de 15–18 cm, sin roturas", pesoCalculoG: 350 },
      { rawText: "40 g AOVE", productId: "p-aove", qty: 40, unit: "g", section: "Aceite de chorizo", note: null, pesoCalculoG: null },
      { rawText: "10 g pimentón de la Vera dulce", productId: null, qty: 10, unit: "g", section: "Aceite de chorizo", note: null, pesoCalculoG: null },
      { rawText: "400 g rape limpio", productId: null, qty: 400, unit: "g", section: "Farsa", note: "muy frío, o merluza", pesoCalculoG: null },
      { rawText: "9 g sal fina", productId: null, qty: 9, unit: "g", section: "Farsa", note: null, pesoCalculoG: null },
    ]);
    expect(response.contentJson.ingredients).toEqual([
      "4 ud calamar, tubos de 15–18 cm, sin roturas",
      "40 g AOVE",
      "10 g pimentón de la Vera dulce",
      "400 g rape limpio, muy frío, o merluza",
      "9 g sal fina",
    ]);
  });

  it("matches on the clean name only, so AOVE is never offered as Chorizo", () => {
    const { response } = standardizeExtractedRecipe(recipe(FLATTENED), BANK);
    expect(vi.mocked(findMatch).mock.calls.map(([name]) => name)).toEqual([
      "calamar", "AOVE", "pimentón de la Vera dulce", "rape limpio", "sal fina",
    ]);
    const offered = [...response.recipeIngredients.map((r) => r.productId), ...response.pendingMatches.map((p) => p.productId)];
    expect(offered).not.toContain("p-chorizo");
  });

  it("probable matches go to pendingMatches, indexed by position in recipeIngredients", () => {
    const { response } = standardizeExtractedRecipe(recipe(FLATTENED), BANK);
    expect(response.pendingMatches).toEqual([{ ingredientIdx: 3, productId: "p-rape", productName: "Rape" }]);
    expect(response.recipeIngredients[3]).toMatchObject({ rawText: "400 g rape limpio", productId: null });
  });

  it("structured objects keep their section and note and come back canonical", () => {
    const { response } = standardizeExtractedRecipe(recipe([
      { section: "Tripa", qty: 4, unit: "unidad", name: "calamares", note: "tubos de 15–18 cm", pieceWeightG: 350 },
      { section: "Aceite de chorizo", qty: "40", unit: "g", name: "AOVE", note: null, pieceWeightG: null },
      { section: "Farsa", qty: "1/2", unit: "cl", name: "ron", note: null, pieceWeightG: null },
      { section: "Farsa", qty: 2, unit: "cucharadas", name: "aceite", note: null, pieceWeightG: null },
    ]), BANK);
    expect(response.recipeIngredients).toEqual([
      { rawText: "4 ud calamar", productId: "p-calamar", qty: 4, unit: "unidad", section: "Tripa", note: "tubos de 15–18 cm", pesoCalculoG: 350 },
      { rawText: "40 g AOVE", productId: "p-aove", qty: 40, unit: "g", section: "Aceite de chorizo", note: null, pesoCalculoG: null },
      { rawText: "5 ml ron", productId: null, qty: 5, unit: "ml", section: "Farsa", note: null, pesoCalculoG: null },
      { rawText: "aceite", productId: null, qty: null, unit: null, section: "Farsa", note: "2 cucharadas", pesoCalculoG: null },
    ]);
    expect(response.contentJson.ingredients).toEqual(["4 ud calamar, tubos de 15–18 cm", "40 g AOVE", "5 ml ron", "aceite, 2 cucharadas"]);
  });

  it("an object whose name still carries a known section gets that section", () => {
    const { response } = standardizeExtractedRecipe(recipe([
      { section: "Aceite de chorizo", qty: 10, unit: "g", name: "pimentón dulce" },
      { section: null, qty: 40, unit: "g", name: "AOVE (aceite de chorizo)" },
    ]), BANK);
    expect(response.recipeIngredients[1]).toMatchObject({ rawText: "40 g AOVE", section: "Aceite de chorizo", note: null, productId: "p-aove" });
  });

  it("bold and «X:» header lines become sections and do not count as ingredients", () => {
    const { response } = standardizeExtractedRecipe(recipe([
      "**Tripa**", "- 4 calamares de 350 g aprox.", "**Aceite de chorizo**", "- 40 g AOVE", "Para la farsa:", "- 400 g rape limpio, muy frío",
    ]), BANK);
    expect(response.recipeIngredients.map((r) => [r.rawText, r.section])).toEqual([
      ["4 ud calamar", "Tripa"], ["40 g AOVE", "Aceite de chorizo"], ["400 g rape limpio", "Farsa"],
    ]);
    expect(response.recipeIngredients[0]!.pesoCalculoG).toBe(350);
    // The header lines are gone, so the probable rape match points at row 2.
    expect(response.pendingMatches).toEqual([{ ingredientIdx: 2, productId: "p-rape", productName: "Rape" }]);
    expect(response.contentJson.ingredients).toHaveLength(3);
  });

  it("a mix of lines and objects keeps the original order", () => {
    const { response } = standardizeExtractedRecipe(recipe([
      "Para la salsa:", "20 cl vino blanco", { section: "Salsa", qty: 1, unit: "unidad", name: "limón" }, "sal c/s",
    ]), []);
    expect(response.recipeIngredients.map((r) => [r.rawText, r.section, r.note])).toEqual([
      ["200 ml vino blanco", "Salsa", null], ["1 ud limón", "Salsa", null], ["sal", null, "c/s"],
    ]);
  });

  it("parenthetical notes that do not repeat as blocks stay notes", () => {
    const { response } = standardizeExtractedRecipe(recipe([
      "200 g harina (tamizada)", "2 huevos (templados)", "50 g azúcar (opcional)", "1 g sal",
    ]), []);
    expect(response.recipeIngredients.map((r) => [r.rawText, r.section, r.note])).toEqual([
      ["200 g harina", null, "tamizada"], ["2 ud huevo", null, "templados"], ["50 g azúcar", null, "opcional"], ["1 g sal", null, null],
    ]);
  });

  it("drops ingredients without a name", () => {
    const { response } = standardizeExtractedRecipe(recipe([{ name: "" }, { qty: 3, unit: "g" }, "  ", "40 g AOVE"]), BANK);
    expect(response.recipeIngredients.map((r) => r.rawText)).toEqual(["40 g AOVE"]);
  });

  it("piece weight only counts for pieces", () => {
    const { response } = standardizeExtractedRecipe(recipe([{ qty: 400, unit: "g", name: "rape", pieceWeightG: 400 }]), []);
    expect(response.recipeIngredients[0]!.pesoCalculoG).toBeNull();
  });

  it("caps each display line at the 500 characters contentJson accepts", () => {
    const { response } = standardizeExtractedRecipe(recipe([{ qty: 1, unit: "g", name: "n".repeat(200), note: "x".repeat(300) }]), []);
    expect(response.contentJson.ingredients[0]).toHaveLength(500);
  });

  it("counts what the normalizer flagged, for logging", () => {
    const { stats } = standardizeExtractedRecipe(recipe([
      "**Salsa**", "2 cucharadas de aceite", "2-3 dientes de ajo, picados", "½ limón", "400 g rape limpio, muy frío", "sal",
    ]), []);
    expect(stats).toEqual({ ingredients: 5, unmeasured: 2, household: 1, range: 1, fraction: 1, note_split: 2, section: 5 });
  });
});
