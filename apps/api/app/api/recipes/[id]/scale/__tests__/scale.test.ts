import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { db, guard } = vi.hoisted(() => {
  const recipe = { findUnique: vi.fn(), create: vi.fn() };
  const recipeIngredient = { createMany: vi.fn() };
  const $transaction = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
    cb({ recipe: { create: recipe.create, findUnique: recipe.findUnique }, recipeIngredient }),
  );
  return {
    db: { recipe, recipeIngredient, $transaction },
    guard: {
      requireAuth: vi.fn(),
      isNextResponse: (v: unknown) =>
        typeof v === "object" && v !== null && "status" in v && "headers" in v,
    },
  };
});

vi.mock("@atelier/db", () => ({ prisma: db }));
vi.mock("@/lib/permissions-guard", () => ({
  requireAuth: guard.requireAuth,
  isNextResponse: guard.isNextResponse,
}));
vi.mock("@/lib/projections", () => ({
  projectRecipeDetail: (r: { id: string; title: string }) => ({ id: r.id, title: r.title }),
  recipeDetailInclude: {},
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import * as route from "../route";

function post(bodyObj: unknown, id = "rec-1") {
  const req = new NextRequest(`https://t.local/api/recipes/${id}/scale`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(bodyObj),
  });
  return route.POST(req, { params: Promise.resolve({ id }) });
}

const SOURCE = {
  id: "rec-1",
  restaurantId: "r1",
  deletedAt: null,
  title: "Risotto",
  contentJson: { ingredients: ["200g arroz", "2 cebollas", "una pizca de sal"], method: ["cocinar"], notes: "" },
  portions: 4,
  salePrice: 1800,
  manualAllergens: [],
  recipeIngredients: [
    { productId: "p1", position: 0, rawText: "200g arroz", qty: 200, unit: "g", pezzatura: null, mermaOverridePct: null, pesoCalculoG: null },
  ],
};

beforeEach(() => {
  db.recipe.findUnique.mockReset();
  db.recipe.create.mockReset().mockResolvedValue({ id: "rec-2" });
  db.recipeIngredient.createMany.mockReset().mockResolvedValue({ count: 1 });
  db.$transaction.mockClear();
  guard.requireAuth.mockReset().mockResolvedValue({ userId: "u1", restaurantId: "r1", role: "chef_executive" });
});

describe("POST /api/recipes/[id]/scale", () => {
  it("escala ingredientes y qty por el factor (4→8 = ×2) y crea copia draft", async () => {
    db.recipe.findUnique
      .mockResolvedValueOnce(SOURCE)
      .mockResolvedValueOnce({ id: "rec-2", title: "Risotto (8 porc.)" });

    const res = await post({ fromPortions: 4, toPortions: 8 });
    expect(res.status).toBe(201);

    const createArg = db.recipe.create.mock.calls[0]![0];
    expect(createArg.data.title).toBe("Risotto (8 porc.)");
    expect(createArg.data.portions).toBe(8);
    expect(createArg.data.state).toBe("draft");
    // Ingredientes de texto escalados; la pizca (sin cantidad) intacta.
    expect(createArg.data.contentJson.ingredients).toEqual([
      "400g arroz",
      "4 cebollas",
      "una pizca de sal",
    ]);

    const ingArg = db.recipeIngredient.createMany.mock.calls[0]![0];
    expect(ingArg.data[0].qty).toBe(400); // 200 × 2
    expect(ingArg.data[0].rawText).toBe("400g arroz");
  });

  it("achica (8→4 = ×0.5)", async () => {
    db.recipe.findUnique.mockResolvedValueOnce(SOURCE).mockResolvedValueOnce({ id: "rec-2", title: "x" });
    await post({ fromPortions: 8, toPortions: 4 });
    const ingArg = db.recipeIngredient.createMany.mock.calls[0]![0];
    expect(ingArg.data[0].qty).toBe(100); // 200 × 0.5
  });

  it("400 con porciones inválidas", async () => {
    const res = await post({ fromPortions: 0, toPortions: 8 });
    expect(res.status).toBe(400);
    expect(db.recipe.create).not.toHaveBeenCalled();
  });

  it("404 si la receta no existe", async () => {
    db.recipe.findUnique.mockResolvedValueOnce(null);
    const res = await post({ fromPortions: 4, toPortions: 8 });
    expect(res.status).toBe(404);
  });
});
