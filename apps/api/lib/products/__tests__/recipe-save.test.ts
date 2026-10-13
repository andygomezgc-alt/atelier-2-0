import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@atelier/db";
import type { RecipeIngredientInput } from "@atelier/shared";
import { ingredientDisplayLines, ingredientsUnchanged, resolveIngredientDrafts } from "../recipe-save";
import { categorizeFromName } from "../defaults";

const product = { count: vi.fn(), findMany: vi.fn(), create: vi.fn() };
const tx = { product } as unknown as Prisma.TransactionClient;

function resolve(ingredients: RecipeIngredientInput[], existing?: Parameters<typeof resolveIngredientDrafts>[3]) {
  return resolveIngredientDrafts(tx, "r1", ingredients, existing);
}

beforeEach(() => {
  vi.resetAllMocks();
  product.count.mockResolvedValue(0);
  product.findMany.mockResolvedValue([]);
  product.create.mockImplementation(async ({ data }) => ({ ...data, id: `draft-${data.name}`, aliases: [] }));
});

describe("resolveIngredientDrafts — the server canonicalizes every line", () => {
  it("rewrites a free-text piece line to the standard rawText, piece weight and note", async () => {
    const [row] = await resolve([{ rawText: "4 calamares de 350 g aprox. (tubos de 15–18 cm, sin roturas)" }]);
    expect(row).toMatchObject({
      rawText: "4 ud calamar", qty: 4, unit: "unidad", pesoCalculoG: 350,
      note: "tubos de 15–18 cm, sin roturas", section: null, productId: null,
    });
  });

  it("creates the draft with the clean name and the category of that name", async () => {
    const [row] = await resolve([{ rawText: "4 calamares de 350 g aprox. (tubos de 15–18 cm, sin roturas)", createProductDraft: true }]);
    expect(product.create).toHaveBeenCalledOnce();
    expect(product.create.mock.calls[0]![0].data).toMatchObject({ name: "calamar", category: categorizeFromName("calamar") });
    expect(row!.productId).toBe("draft-calamar");
  });

  it("a draft for an already-cleaned product starts at 0 % waste; a whole one keeps the category's", async () => {
    await resolve([
      { rawText: "150 g gamba pelada, muy fría", createProductDraft: true },
      { rawText: "200 g gamba roja", createProductDraft: true },
    ]);
    expect(product.create.mock.calls[0]![0].data).toMatchObject({ name: "gamba pelada", category: "pescado", mermaPct: 0 });
    expect(product.create.mock.calls[1]![0].data).toMatchObject({ name: "gamba roja", category: "pescado", mermaPct: 50 });
  });

  it("reads a parenthetical that names a sibling's section as the section, never as part of the name", async () => {
    const rows = await resolve([
      { rawText: "100 g chorizo", section: "Aceite de chorizo", createProductDraft: true },
      { rawText: "40 g AOVE (aceite de chorizo)", createProductDraft: true },
    ]);
    expect(rows[1]).toMatchObject({ rawText: "40 g AOVE", qty: 40, unit: "g", section: "Aceite de chorizo", note: null });
    const draftNames = product.create.mock.calls.map(([arg]) => arg.data.name);
    expect(draftNames).toEqual(["chorizo", "AOVE"]);
    expect(product.create.mock.calls[1]![0].data.category).toBe(categorizeFromName("AOVE"));
    expect(product.create.mock.calls[1]![0].data.category).not.toBe(categorizeFromName("chorizo"));
  });

  it("keeps the row's own section and drops the duplicate parenthetical", async () => {
    const [row] = await resolve([{ rawText: "40 g AOVE (aceite de chorizo)", section: "Aceite de chorizo" }]);
    expect(row).toMatchObject({ rawText: "40 g AOVE", section: "Aceite de chorizo", note: null });
  });

  it("keeps the text of a parenthetical when the client sends no section for the row", async () => {
    const rows = await resolve([
      { rawText: "100 g chorizo", section: "Aceite de chorizo" },
      { rawText: "40 g AOVE (aceite de chorizo)", section: null },
    ]);
    expect(rows[1]).toMatchObject({ rawText: "40 g AOVE", section: null, note: "aceite de chorizo" });
  });

  it("matches an unmeasured line by its clean name", async () => {
    product.findMany.mockResolvedValue([{ id: "oil", name: "Aceite", aliases: [] }]);
    const [row] = await resolve([{ rawText: "1 cucharada aceite", createProductDraft: true }]);
    expect(product.create).not.toHaveBeenCalled();
    expect(row).toMatchObject({ productId: "oil", rawText: "aceite", qty: null, unit: null, note: "1 cucharada" });
  });

  it("links the singular standard name to an existing plural bank product without a new draft", async () => {
    product.findMany.mockResolvedValue([{ id: "tomatoes", name: "Tomates", aliases: [] }]);
    const [row] = await resolve([{ rawText: "3 tomates", createProductDraft: true }]);
    expect(product.create).not.toHaveBeenCalled();
    expect(row!.productId).toBe("tomatoes");
  });

  it("keeps explicit client qty/unit that contradict the text, with the client's rawText as is", async () => {
    const [row] = await resolve([{ rawText: "300 g patata, pelada", qty: 250, unit: "g", note: "en dados" }]);
    expect(row).toMatchObject({ rawText: "300 g patata, pelada", qty: 250, unit: "g", note: "en dados" });
  });

  it("canonicalizes when the client's qty/unit agree with the text", async () => {
    const [row] = await resolve([{ rawText: "300g patata, pelada", qty: 300, unit: "g" }]);
    expect(row).toMatchObject({ rawText: "300 g patata", qty: 300, unit: "g", note: "pelada" });
  });

  it("keeps the client's piece weight, and only fills it from the text when none was sent", async () => {
    const [kept] = await resolve([{ rawText: "4 calamares de 350 g", pesoCalculoG: 300 }]);
    expect(kept!.pesoCalculoG).toBe(300);
    const [filled] = await resolve([{ rawText: "4 calamares de 350 g", pesoCalculoG: null }]);
    expect(filled!.pesoCalculoG).toBe(350);
  });
});

describe("resolveIngredientDrafts — notes and sections of older clients", () => {
  const existing = [
    { position: 0, rawText: "4 ud calamar", section: "Calamar", note: "tubos de 15–18 cm" },
    { position: 1, rawText: "40 g AOVE", section: "Aceite de chorizo", note: "en frío" },
  ];

  it("inherits section and note from the stored line at the same position with the same clean name", async () => {
    const rows = await resolve([{ rawText: "4 ud calamar", qty: 4, unit: "unidad" }, { rawText: "40 g AOVE" }], existing);
    expect(rows.map(({ section, note }) => ({ section, note }))).toEqual([
      { section: "Calamar", note: "tubos de 15–18 cm" },
      { section: "Aceite de chorizo", note: "en frío" },
    ]);
  });

  it("inherits after a quantity change of the same ingredient", async () => {
    const [row] = await resolve([{ rawText: "6 ud calamar" }], existing);
    expect(row).toMatchObject({ rawText: "6 ud calamar", section: "Calamar", note: "tubos de 15–18 cm" });
  });

  it("does not inherit across a different ingredient or position", async () => {
    const rows = await resolve([{ rawText: "40 g AOVE" }, { rawText: "4 ud calamar" }], existing);
    expect(rows.map(({ section, note }) => ({ section, note }))).toEqual([
      { section: null, note: null },
      { section: null, note: null },
    ]);
  });

  it("an explicit value, null included, wins over the inherited one", async () => {
    const [row] = await resolve([{ rawText: "4 ud calamar", section: null, note: null }], existing);
    expect(row).toMatchObject({ section: null, note: null });
  });

  it("a note written in the text wins over the client's note field", async () => {
    const [row] = await resolve([{ rawText: "4 ud calamar, limpio", note: "otra" }], existing);
    expect(row!.note).toBe("limpio");
  });
});

describe("ingredientDisplayLines", () => {
  it("is the rawText plus the note, in order", () => {
    expect(ingredientDisplayLines([
      { rawText: "4 ud calamar", note: "tubos de 15–18 cm" },
      { rawText: "sal", note: null },
    ])).toEqual(["4 ud calamar, tubos de 15–18 cm", "sal"]);
  });

  it("never exceeds the 500-character line limit of contentJson", () => {
    const [line] = ingredientDisplayLines([{ rawText: "x".repeat(400), note: "y".repeat(300) }]);
    expect(line!.length).toBe(500);
  });
});

describe("ingredientsUnchanged — resolved rows out of step", () => {
  const stored = [{
    position: 0, rawText: "200 g arroz", note: null, section: null,
    productId: null, unit: "g", pezzatura: null, qty: 200, mermaOverridePct: null, pesoCalculoG: null,
  }];

  it("counts a change instead of throwing when the resolved rows do not line up with the incoming ones", () => {
    expect(ingredientsUnchanged([{ rawText: "200 g arroz", pesoCalculoG: null }], [], stored)).toBe(false);
  });
});
