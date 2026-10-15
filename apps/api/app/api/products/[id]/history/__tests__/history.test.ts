// apps/api/app/api/products/[id]/history/__tests__/history.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const { db, guard } = vi.hoisted(() => ({
  db: { product: { findUnique: vi.fn(), findFirst: vi.fn() }, productPriceHistory: { findMany: vi.fn() }, yieldTest: { findMany: vi.fn() } },
  guard: { requireAuth: vi.fn() },
}));
vi.mock("@atelier/db", () => ({ prisma: db }));
vi.mock("@/lib/permissions-guard", () => ({ requireAuth: guard.requireAuth, isNextResponse: (v: unknown) => v instanceof Response }));
import { GET } from "../route";

beforeEach(() => {
  vi.clearAllMocks();
  guard.requireAuth.mockResolvedValue({ userId: "u1", role: "admin", restaurantId: "r1" });
  const product = { id: "p1", restaurantId: "r1", deletedAt: null };
  db.product.findUnique.mockResolvedValue(product);
  db.product.findFirst.mockResolvedValue(product);
  db.yieldTest.findMany.mockResolvedValue([]);
  db.productPriceHistory.findMany.mockResolvedValue([
    { id: "h1", precio: 180, unidadCompra: "kg", createdAt: new Date("2026-10-15T09:00:00Z"), author: null, invoiceLine: { invoiceId: "inv1" } },
    { id: "h2", precio: 150, unidadCompra: "kg", createdAt: new Date("2026-10-01T09:00:00Z"), author: { id: "u1", name: "Andy" }, invoiceLine: null },
  ]);
});

describe("GET /api/products/[id]/history", () => {
  it("each price says which invoice it came from, if any", async () => {
    const body = await (await GET(new NextRequest("https://t.local/api/products/p1/history"))).json();
    expect(body.priceHistory).toEqual([
      { id: "h1", precio: 180, unidadCompra: "kg", createdAt: "2026-10-15T09:00:00.000Z", author: null, invoiceId: "inv1" },
      { id: "h2", precio: 150, unidadCompra: "kg", createdAt: "2026-10-01T09:00:00.000Z", author: { id: "u1", name: "Andy" }, invoiceId: null },
    ]);
  });
});
