// GET /api/products?trash=true — la papelera lista solo los borrados
// (deletedAt != null). El listado normal filtra deletedAt=null. Mockeamos
// withAuth + prisma para no tocar DB.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { db, ctx } = vi.hoisted(() => ({
  db: {
    product: { findMany: vi.fn() },
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
  projectProductListItem: (p: { id: string }) => ({ id: p.id }),
  projectProductDetail: (p: { id: string }) => ({ id: p.id }),
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import * as route from "../route";

function get(qs = "") {
  return route.GET(new NextRequest(`https://t.local/api/products${qs}`));
}

beforeEach(() => {
  db.product.findMany.mockReset().mockResolvedValue([{ id: "p1" }]);
  db.recipeIngredient.findMany.mockReset().mockResolvedValue([]);
});

describe("GET /api/products?trash", () => {
  it("lista normal: filtra deletedAt=null", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const where = db.product.findMany.mock.calls[0]![0].where;
    expect(where.deletedAt).toBeNull();
  });

  it("?trash=true: lista solo los borrados (deletedAt != null)", async () => {
    const res = await get("?trash=true");
    expect(res.status).toBe(200);
    const arg = db.product.findMany.mock.calls[0]![0];
    expect(arg.where.deletedAt).toEqual({ not: null });
    // ordena por borrado más reciente primero.
    expect(arg.orderBy).toEqual([{ deletedAt: "desc" }]);
  });
});
