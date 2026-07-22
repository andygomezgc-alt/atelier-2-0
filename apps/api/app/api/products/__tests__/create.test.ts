import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// prisma mock con $transaction interactivo (tx === db para reusar los spies).
const { db, ctx } = vi.hoisted(() => ({
  db: {
    product: { create: vi.fn() },
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
  projectProductListItem: (p: { id: string }) => ({ id: p.id }),
  projectProductDetail: (p: { id: string }) => ({ id: p.id }),
}));
vi.mock("@/lib/products/criticality", () => ({ defaultCriticality: () => "media" }));
vi.mock("@/lib/products/defaults", () => ({ defaultMermaPct: () => 10 }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import * as route from "../route";

function create(body: unknown) {
  return route.POST(
    new NextRequest("https://t.local/api/products", {
      method: "POST",
      headers: { "x-test-body": JSON.stringify(body) },
    }),
  );
}

beforeEach(() => {
  db.product.create.mockReset();
  db.productPriceHistory.create.mockReset().mockResolvedValue({ id: "h1" });
  db.$transaction
    .mockReset()
    .mockImplementation(async (cb: (tx: typeof db) => unknown) => cb(db));
});

describe("POST /api/products", () => {
  it("con precio > 0 → crea producto + primera fila de histórico en la MISMA tx", async () => {
    db.product.create.mockResolvedValue({
      id: "p1",
      precioCompra: 100,
      unidadCompra: "kg",
      category: "verdura",
      criticality: "media",
    });

    const res = await create({
      name: "Patata",
      category: "verdura",
      unidadCompra: "kg",
      precioCompra: 100,
    });

    expect(res.status).toBe(201);
    // Una sola transacción envuelve el create + el histórico.
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.product.create).toHaveBeenCalledTimes(1);
    expect(db.productPriceHistory.create).toHaveBeenCalledWith({
      data: { productId: "p1", authorId: "u1", precio: 100, unidadCompra: "kg" },
    });
  });

  it("con precio 0 → crea producto sin fila de histórico", async () => {
    db.product.create.mockResolvedValue({
      id: "p2",
      precioCompra: 0,
      unidadCompra: "kg",
      category: "verdura",
      criticality: "media",
    });

    const res = await create({
      name: "Agua",
      category: "verdura",
      unidadCompra: "kg",
      precioCompra: 0,
    });

    expect(res.status).toBe(201);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.productPriceHistory.create).not.toHaveBeenCalled();
  });
});
