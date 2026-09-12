import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { projectRecipeDetail } from "@/lib/projections";

const { db } = vi.hoisted(() => ({ db: {
  recipe: { create: vi.fn(), findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
  recipeIngredient: { createMany: vi.fn() },
  product: { count: vi.fn() },
  $transaction: vi.fn(),
  $queryRaw: vi.fn().mockResolvedValue([]),
} }));
vi.mock("@atelier/db", () => ({ prisma: db }));
vi.mock("@/lib/permissions-guard", () => ({
  requireAuth: async () => ({ userId: "u1", restaurantId: "r1", role: "admin" }),
  isNextResponse: () => false,
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn() } }));
import { POST } from "../route";
import { GET } from "../[id]/route";

type Row = Parameters<typeof projectRecipeDetail>[0];
let stored: Row;
let price: number;

beforeEach(() => {
  vi.clearAllMocks();
  price = 0;
  db.product.count.mockResolvedValue(1);
  db.$transaction.mockImplementation(async (cb: (tx: typeof db) => unknown) => cb(db));
  db.recipe.create.mockImplementation(async ({ data }) => {
    stored = { ...data, id: "recipe", deletedAt: null, portions: data.portions ?? null,
      salePrice: null, updatedAt: new Date(), createdAt: new Date(), author: { name: "Chef", email: null },
      approvedAt: null, approvedBy: null, manualAllergens: [], menuItems: [], recipeIngredients: [],
    };
    return stored;
  });
  db.recipeIngredient.createMany.mockImplementation(async ({ data }) => {
    stored.recipeIngredients = data.map((row: object, i: number) => ({ ...row, id: `ingredient-${i}` }));
    return { count: data.length };
  });
  db.recipe.findUnique.mockImplementation(async () => ({ ...stored,
    recipeIngredients: stored.recipeIngredients.map(row => ({ ...row, product: {
      id: "p1", name: "Harina", criticality: "media", estado: "activo", precioCompra: price,
      mermaPct: 20, unidadCompra: "g", pezzaturaMode: null, pezzaturaMin: null, pezzaturaMax: null, allergen: null,
    } })),
  }));
  db.recipe.findUniqueOrThrow.mockImplementation(() => db.recipe.findUnique());
});

function create(body: unknown) {
  return POST(new NextRequest("https://test.local/api/recipes", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }));
}
async function read() {
  const response = await GET(new NextRequest("https://test.local/api/recipes/recipe"), { params: Promise.resolve({ id: "recipe" }) });
  return response.json();
}
const contentJson = { ingredients: ["1000 g harina"], method: ["Mezclar"], notes: "" };

describe("save recipe → enter bank price → automatic cost", () => {
  it("keeps portions, parses quantities, and computes current prices without resaving", async () => {
    const response = await create({ title: "Masa", portions: 4, contentJson, recipeIngredients: [{ rawText: "1000 g harina", productId: "p1" }] });
    expect(response.status).toBe(201);
    expect(stored.portions).toBe(4);
    expect(stored.recipeIngredients[0]).toMatchObject({ qty: 1000, unit: "g" });
    expect((await read()).cost).toMatchObject({ totalCents: null, missingPriceCount: 1 });
    price = 1;
    expect((await read()).cost).toMatchObject({ totalCents: 1250, perPortionCents: 313, missingPriceCount: 0 });
    price = 2;
    expect((await read()).cost.totalCents).toBe(2500);
    expect(db.recipe.create).toHaveBeenCalledOnce();
  });
  it("also persists portions for a recipe without structured ingredients", async () => {
    expect((await create({ title: "Masa", portions: 4, contentJson })).status).toBe(201);
    expect(stored.portions).toBe(4);
  });
  it.each([0, -1, 1.5, 1001])("rejects invalid portions %s before writing", async portions => {
    expect((await create({ title: "Masa", portions, contentJson })).status).toBe(400);
    expect(db.recipe.create).not.toHaveBeenCalled();
  });
});
