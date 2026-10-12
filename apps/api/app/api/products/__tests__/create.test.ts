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
// Like the real withAuth: the route's body schema rejects invalid input with
// 400 invalid_body before the handler runs.
vi.mock("@/lib/with-auth", () => ({
  withAuth:
    (
      opts: { body?: { safeParse(v: unknown): { success: boolean; data?: unknown } } },
      handler: (c: unknown, b: unknown, req: NextRequest) => unknown,
    ) =>
    (req: NextRequest) => {
      const raw = JSON.parse(req.headers.get("x-test-body") ?? "{}");
      const parsed = opts.body ? opts.body.safeParse(raw) : { success: true, data: raw };
      if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 });
      return handler(ctx, parsed.data, req);
    },
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
  it.each([{ allergens: ["milk", "eggs"] }, { allergens: [] }])("persiste una declaración explícita de alérgenos: $allergens", async ({ allergens }) => {
    db.product.create.mockImplementation(async ({ data }) => ({ id: "p-allergens", ...data }));
    const res = await create({ name: "Producto revisado", category: "otro", unidadCompra: "kg", precioCompra: 0, allergens });
    expect(res.status).toBe(201);
    expect(db.product.create.mock.calls[0]![0].data).toMatchObject({ allergens, allergensReviewed: true, allergen: allergens[0] ?? null });
  });
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

  describe("gramosPorLitro (weight of one litre)", () => {
    const oil = { name: "Aceite de oliva", category: "vinagre_aceite", unidadCompra: "l", precioCompra: 500 };

    beforeEach(() => {
      db.product.create.mockImplementation(async ({ data }) => ({ id: "p-oil", ...data }));
    });

    it("persists the declared weight per litre", async () => {
      const res = await create({ ...oil, gramosPorLitro: 920 });
      expect(res.status).toBe(201);
      expect(db.product.create.mock.calls[0]![0].data.gramosPorLitro).toBe(920);
    });

    it("never invents one when the chef does not declare it", async () => {
      const res = await create(oil);
      expect(res.status).toBe(201);
      expect(db.product.create.mock.calls[0]![0].data.gramosPorLitro).toBeNull();
    });

    it.each([0, -5, 920.123, 100000])("rejects %s with 400 before writing", async (gramosPorLitro) => {
      const res = await create({ ...oil, gramosPorLitro });
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: "invalid_body" });
      expect(db.product.create).not.toHaveBeenCalled();
    });
  });
});
