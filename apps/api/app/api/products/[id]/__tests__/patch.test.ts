import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { db, ctx } = vi.hoisted(() => ({
  db: {
    product: { findUnique: vi.fn(), updateMany: vi.fn() },
    productPriceHistory: { create: vi.fn() },
    $transaction: vi.fn(),
  },
  ctx: { userId: "u1", restaurantId: "r1", role: "chef_executive" },
}));

vi.mock("@atelier/db", () => ({ prisma: db }));
vi.mock("@/lib/with-auth", () => ({
  withAuth:
    (_opts: unknown, handler: (c: unknown, b: unknown, req: NextRequest) => unknown) =>
    (req: NextRequest) =>
      handler(ctx, JSON.parse(req.headers.get("x-test-body") ?? "{}"), req),
}));
vi.mock("@/lib/products/projections", () => ({
  projectProductDetail: (p: { id: string; name: string }) => ({ id: p.id, name: p.name }),
}));
vi.mock("@/lib/products/criticality", () => ({ defaultCriticality: () => "media" }));
vi.mock("@/lib/products/usage", () => ({
  countRecipesUsingProduct: vi.fn().mockResolvedValue(0),
  countRecipesUsingProductByUnit: vi.fn().mockResolvedValue(0),
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import * as route from "../route";

const EXISTING = {
  id: "p1",
  restaurantId: "r1",
  deletedAt: null,
  name: "Patata",
  category: "verdura",
  criticality: "media",
  criticalityManual: false,
  mermaPct: 10,
  mermaOrigen: "confirmada",
  precioCompra: 100,
  unidadCompra: "kg",
};

function patch(body: unknown, id = "p1") {
  return route.PATCH(
    new NextRequest(`https://t.local/api/products/${id}`, {
      method: "PATCH",
      headers: { "x-test-body": JSON.stringify(body) },
    }),
  );
}

beforeEach(() => {
  db.product.findUnique
    .mockReset()
    .mockResolvedValueOnce(EXISTING)
    .mockResolvedValue({ ...EXISTING, name: "Patata nueva" });
  db.product.updateMany.mockReset().mockResolvedValue({ count: 1 });
  db.productPriceHistory.create.mockReset().mockResolvedValue({ id: "h1" });
  // $transaction interactivo: ejecuta el callback con `db` como tx.
  db.$transaction
    .mockReset()
    .mockImplementation(async (cb: (tx: typeof db) => unknown) => cb(db));
});

describe("PATCH /api/products/:id", () => {
  it("actualiza con where atomico y re-fetch tenant-scoped", async () => {
    const res = await patch({ name: "Patata nueva" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "p1", name: "Patata nueva" });
    expect(db.product.updateMany).toHaveBeenCalledWith({
      where: { id: "p1", restaurantId: "r1", deletedAt: null },
      data: expect.objectContaining({ name: "Patata nueva" }),
    });
    expect(db.product.findUnique).toHaveBeenLastCalledWith({
      where: { id: "p1", restaurantId: "r1", deletedAt: null },
    });
  });

  it("404 si el producto deja de ser mutable antes de la escritura", async () => {
    db.product.updateMany.mockResolvedValueOnce({ count: 0 });

    const res = await patch({ name: "Patata nueva" });

    expect(res.status).toBe(404);
    expect(db.product.findUnique).toHaveBeenCalledOnce();
    expect(db.productPriceHistory.create).not.toHaveBeenCalled();
  });

  it("cambio de precio → escribe el histórico en la MISMA tx que el update", async () => {
    const res = await patch({ precioCompra: 250 });

    expect(res.status).toBe(200);
    // update + histórico dentro de una única transacción.
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.product.updateMany).toHaveBeenCalledWith({
      where: { id: "p1", restaurantId: "r1", deletedAt: null },
      data: expect.objectContaining({ precioCompra: 250 }),
    });
    expect(db.productPriceHistory.create).toHaveBeenCalledWith({
      data: { productId: "p1", authorId: "u1", precio: 250, unidadCompra: "kg" },
    });
  });
});
