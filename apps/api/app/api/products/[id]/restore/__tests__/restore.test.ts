import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { db, guard } = vi.hoisted(() => ({
  db: { product: { findUnique: vi.fn(), update: vi.fn() } },
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
vi.mock("@/lib/products/projections", () => ({
  projectProductDetail: (p: { id: string }) => ({ id: p.id }),
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import * as route from "../route";

function post(id = "prod-1") {
  const req = new NextRequest(`https://t.local/api/products/${id}/restore`, { method: "POST" });
  return route.POST(req, { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  db.product.findUnique.mockReset();
  db.product.update.mockReset().mockResolvedValue({ id: "prod-1" });
  guard.requireAuth.mockReset().mockResolvedValue({ userId: "u1", restaurantId: "r1", role: "chef_executive" });
});

describe("POST /api/products/[id]/restore", () => {
  it("restaura un producto borrado (deletedAt -> null)", async () => {
    db.product.findUnique.mockResolvedValueOnce({ id: "prod-1", restaurantId: "r1", deletedAt: new Date() });
    const res = await post("prod-1");
    expect(res.status).toBe(200);
    const updateArg = db.product.update.mock.calls[0]![0];
    expect(updateArg.data.deletedAt).toBeNull();
  });

  it("404 si no existe", async () => {
    db.product.findUnique.mockResolvedValueOnce(null);
    const res = await post("nope");
    expect(res.status).toBe(404);
    expect(db.product.update).not.toHaveBeenCalled();
  });

  it("404 si NO está borrado (nada que restaurar)", async () => {
    db.product.findUnique.mockResolvedValueOnce({ id: "prod-1", restaurantId: "r1", deletedAt: null });
    const res = await post("prod-1");
    expect(res.status).toBe(404);
    expect(db.product.update).not.toHaveBeenCalled();
  });

  it("404 si es de otro restaurante (anti-IDOR)", async () => {
    db.product.findUnique.mockResolvedValueOnce({ id: "prod-1", restaurantId: "otro", deletedAt: new Date() });
    const res = await post("prod-1");
    expect(res.status).toBe(404);
    expect(db.product.update).not.toHaveBeenCalled();
  });
});
