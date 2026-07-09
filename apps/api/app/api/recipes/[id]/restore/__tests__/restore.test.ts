import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { db, guard } = vi.hoisted(() => ({
  db: { recipe: { findUnique: vi.fn(), update: vi.fn() } },
  guard: {
    requireAuth: vi.fn(),
    isNextResponse: (v: unknown) =>
      typeof v === "object" && v !== null && "status" in v && "headers" in v,
  },
}));

vi.mock("@atelier/db", () => ({ prisma: db }));
vi.mock("@/lib/permissions-guard", () => ({
  requireAuth: guard.requireAuth,
  isNextResponse: guard.isNextResponse,
}));
vi.mock("@/lib/projections", () => ({
  projectRecipeDetail: (r: { id: string }) => ({ id: r.id }),
  recipeDetailInclude: {},
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import * as route from "../route";

function post(id = "rec-1") {
  const req = new NextRequest(`https://t.local/api/recipes/${id}/restore`, { method: "POST" });
  return route.POST(req, { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  db.recipe.findUnique.mockReset();
  db.recipe.update.mockReset().mockResolvedValue({});
  guard.requireAuth.mockReset().mockResolvedValue({ userId: "u1", restaurantId: "r1", role: "chef_executive" });
});

describe("POST /api/recipes/[id]/restore", () => {
  it("restaura una receta borrada (deletedAt -> null)", async () => {
    db.recipe.findUnique
      .mockResolvedValueOnce({ id: "rec-1", restaurantId: "r1", deletedAt: new Date() })
      .mockResolvedValueOnce({ id: "rec-1" });
    const res = await post("rec-1");
    expect(res.status).toBe(200);
    const updateArg = db.recipe.update.mock.calls[0]![0];
    expect(updateArg.data.deletedAt).toBeNull();
  });

  it("404 si no existe", async () => {
    db.recipe.findUnique.mockResolvedValueOnce(null);
    const res = await post("nope");
    expect(res.status).toBe(404);
    expect(db.recipe.update).not.toHaveBeenCalled();
  });

  it("404 si NO está borrada (nada que restaurar)", async () => {
    db.recipe.findUnique.mockResolvedValueOnce({ id: "rec-1", restaurantId: "r1", deletedAt: null });
    const res = await post("rec-1");
    expect(res.status).toBe(404);
    expect(db.recipe.update).not.toHaveBeenCalled();
  });

  it("404 si es de otro restaurante (anti-IDOR)", async () => {
    db.recipe.findUnique.mockResolvedValueOnce({ id: "rec-1", restaurantId: "otro", deletedAt: new Date() });
    const res = await post("rec-1");
    expect(res.status).toBe(404);
  });
});
