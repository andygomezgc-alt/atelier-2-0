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
  projectRecipeDetail: (r: { id: string; title: string; state: string }) => ({
    id: r.id,
    title: r.title,
    state: r.state,
  }),
  recipeDetailInclude: {},
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import * as route from "../route";

function post(id = "rec-1") {
  const req = new NextRequest(`https://t.local/api/recipes/${id}/duplicate`, { method: "POST" });
  return route.POST(req, { params: Promise.resolve({ id }) });
}

const SOURCE = {
  id: "rec-1",
  restaurantId: "r1",
  deletedAt: null,
  title: "Risotto",
  contentJson: { ingredients: ["arroz"], method: ["cocinar"], notes: "" },
  portions: 4,
  salePrice: 1800,
  manualAllergens: ["gluten"],
  recipeIngredients: [
    { productId: "p1", position: 0, rawText: "200g arroz", qty: 200, unit: "g", pezzatura: null, mermaOverridePct: null, pesoCalculoG: null },
  ],
};

beforeEach(() => {
  db.recipe.findUnique.mockReset();
  db.recipe.create.mockReset();
  db.recipeIngredient.createMany.mockReset().mockResolvedValue({ count: 1 });
  db.$transaction.mockClear();
  guard.requireAuth.mockReset().mockResolvedValue({ userId: "u1", restaurantId: "r1", role: "chef_executive" });
});

describe("POST /api/recipes/[id]/duplicate", () => {
  it("crea una copia draft v1 con (copia) en el título y clona ingredientes", async () => {
    db.recipe.findUnique
      .mockResolvedValueOnce(SOURCE) // source
      .mockResolvedValueOnce({ id: "rec-2", title: "Risotto (copia)", state: "draft" }); // final
    db.recipe.create.mockResolvedValue({ id: "rec-2" });

    const res = await post("rec-1");
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("rec-2");
    expect(body.title).toBe("Risotto (copia)");
    expect(body.state).toBe("draft");

    const createArg = db.recipe.create.mock.calls[0]![0];
    expect(createArg.data.title).toBe("Risotto (copia)");
    expect(createArg.data.state).toBe("draft");
    expect(createArg.data.version).toBe(1);
    expect(createArg.data.priority).toBe(false);
    expect(createArg.data.portions).toBe(4);

    const ingArg = db.recipeIngredient.createMany.mock.calls[0]![0];
    expect(ingArg.data).toHaveLength(1);
    expect(ingArg.data[0].recipeId).toBe("rec-2");
    expect(ingArg.data[0].productId).toBe("p1");
  });

  it("404 si la receta no existe", async () => {
    db.recipe.findUnique.mockResolvedValueOnce(null);
    const res = await post("nope");
    expect(res.status).toBe(404);
    expect(db.recipe.create).not.toHaveBeenCalled();
  });

  it("404 si la receta es de otro restaurante (anti-IDOR)", async () => {
    db.recipe.findUnique.mockResolvedValueOnce({ ...SOURCE, restaurantId: "otro" });
    const res = await post("rec-1");
    expect(res.status).toBe(404);
  });

  it("404 si la receta está borrada", async () => {
    db.recipe.findUnique.mockResolvedValueOnce({ ...SOURCE, deletedAt: new Date() });
    const res = await post("rec-1");
    expect(res.status).toBe(404);
  });
});
