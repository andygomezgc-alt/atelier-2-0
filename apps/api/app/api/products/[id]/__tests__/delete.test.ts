// DELETE /api/products/:id — soft-delete a papelera, con protección "en uso"
// (409 + lista de recetas) salvo ?force=true. Mockeamos withAuth + prisma.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { db, ctx } = vi.hoisted(() => ({
  db: {
    product: { findUnique: vi.fn(), updateMany: vi.fn() },
    recipeIngredient: { findMany: vi.fn() },
  },
  ctx: { userId: "u1", restaurantId: "r1", role: "chef_executive" },
}));

vi.mock("@atelier/db", () => ({ prisma: db }));
vi.mock("@/lib/with-auth", () => ({
  withAuth:
    (_opts: unknown, handler: (c: unknown, b: unknown, req: NextRequest) => unknown) =>
    (req: NextRequest) =>
      handler(ctx, undefined, req),
}));
vi.mock("@/lib/products/projections", () => ({
  projectProductDetail: (p: { id: string }) => ({ id: p.id }),
}));
vi.mock("@/lib/products/criticality", () => ({ defaultCriticality: () => "media" }));
vi.mock("@/lib/products/usage", () => ({
  countRecipesUsingProduct: vi.fn().mockResolvedValue(0),
  countRecipesUsingProductByUnit: vi.fn().mockResolvedValue(0),
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import * as route from "../route";

function del(id = "p1", qs = "") {
  return route.DELETE(
    new NextRequest(`https://t.local/api/products/${id}${qs}`, { method: "DELETE" }),
  );
}

beforeEach(() => {
  db.product.findUnique.mockReset().mockResolvedValue({
    id: "p1",
    restaurantId: "r1",
    deletedAt: null,
  });
  db.product.updateMany.mockReset().mockResolvedValue({ count: 1 });
  db.recipeIngredient.findMany.mockReset().mockResolvedValue([]);
});

describe("DELETE /api/products/:id", () => {
  it("sin uso → soft-delete (setea deletedAt) y 200 {ok:true}", async () => {
    const res = await del("p1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const arg = db.product.updateMany.mock.calls[0]![0];
    expect(arg.where).toEqual({
      id: "p1",
      restaurantId: "r1",
      deletedAt: null,
    });
    expect(arg.data.deletedAt).toBeInstanceOf(Date);
  });

  it("en uso y sin force → 409 product_in_use con las recetas, sin borrar", async () => {
    db.recipeIngredient.findMany.mockResolvedValueOnce([
      { recipe: { id: "r1", title: "Ricciola in Bianco" } },
      { recipe: { id: "r1", title: "Ricciola in Bianco" } }, // dup misma receta
      { recipe: { id: "r2", title: "Tataki" } },
    ]);
    const res = await del("p1");
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("product_in_use");
    expect(body.recipes).toHaveLength(2); // deduplicado por receta
    expect(db.product.updateMany).not.toHaveBeenCalled();
  });

  it("en uso pero con ?force=true → borra igual (200)", async () => {
    db.recipeIngredient.findMany.mockResolvedValue([
      { recipe: { id: "r2", title: "Tataki" } },
    ]);
    const res = await del("p1", "?force=true");
    expect(res.status).toBe(200);
    expect(db.recipeIngredient.findMany).not.toHaveBeenCalled(); // con force ni consulta uso
    expect(db.product.updateMany).toHaveBeenCalledOnce();
  });

  it("404 si es de otro restaurante (anti-IDOR)", async () => {
    db.product.findUnique.mockResolvedValueOnce({
      id: "p1",
      restaurantId: "otro",
      deletedAt: null,
    });
    const res = await del("p1");
    expect(res.status).toBe(404);
    expect(db.product.updateMany).not.toHaveBeenCalled();
  });

  it("404 si ya está en la papelera", async () => {
    db.product.findUnique.mockResolvedValueOnce({
      id: "p1",
      restaurantId: "r1",
      deletedAt: new Date(),
    });
    const res = await del("p1");
    expect(res.status).toBe(404);
  });

  it("404 si deja de ser mutable antes del soft-delete", async () => {
    db.product.updateMany.mockResolvedValueOnce({ count: 0 });

    const res = await del("p1");

    expect(res.status).toBe(404);
    expect(db.product.updateMany).toHaveBeenCalledWith({
      where: { id: "p1", restaurantId: "r1", deletedAt: null },
      data: { deletedAt: expect.any(Date) },
    });
  });
});
