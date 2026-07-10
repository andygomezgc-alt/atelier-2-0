import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { db, guard } = vi.hoisted(() => ({
  db: { menuFolder: { findUnique: vi.fn(), update: vi.fn() } },
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
  projectMenuDetail: (m: { id: string }) => ({ id: m.id }),
  menuDetailInclude: {},
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import * as route from "../route";

function post(id = "menu-1") {
  return route.POST(new NextRequest(`https://t.local/api/menus/${id}/restore`, { method: "POST" }), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => {
  db.menuFolder.findUnique.mockReset();
  db.menuFolder.update.mockReset().mockResolvedValue({});
  guard.requireAuth.mockReset().mockResolvedValue({ userId: "u1", restaurantId: "r1", role: "chef_executive" });
});

describe("POST /api/menus/[id]/restore", () => {
  it("restaura un menú borrado (deletedAt -> null)", async () => {
    db.menuFolder.findUnique
      .mockResolvedValueOnce({ id: "menu-1", restaurantId: "r1", deletedAt: new Date() })
      .mockResolvedValueOnce({ id: "menu-1" });
    const res = await post("menu-1");
    expect(res.status).toBe(200);
    expect(db.menuFolder.update.mock.calls[0]![0].data.deletedAt).toBeNull();
  });

  it("404 si no existe", async () => {
    db.menuFolder.findUnique.mockResolvedValueOnce(null);
    const res = await post("nope");
    expect(res.status).toBe(404);
    expect(db.menuFolder.update).not.toHaveBeenCalled();
  });

  it("404 si NO está borrado (nada que restaurar)", async () => {
    db.menuFolder.findUnique.mockResolvedValueOnce({ id: "menu-1", restaurantId: "r1", deletedAt: null });
    const res = await post("menu-1");
    expect(res.status).toBe(404);
  });

  it("404 si es de otro restaurante (anti-IDOR)", async () => {
    db.menuFolder.findUnique.mockResolvedValueOnce({ id: "menu-1", restaurantId: "otro", deletedAt: new Date() });
    const res = await post("menu-1");
    expect(res.status).toBe(404);
  });
});
