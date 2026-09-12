import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const { db } = vi.hoisted(() => ({ db: {
  menuFolder: { findUnique: vi.fn(), update: vi.fn() },
  recipe: { findUnique: vi.fn() },
  menuSection: { count: vi.fn() },
  menuItem: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  $transaction: vi.fn(),
} }));
vi.mock("@atelier/db", () => ({ prisma: db, Prisma: { PrismaClientKnownRequestError: class extends Error {} } }));
vi.mock("@/lib/permissions-guard", () => ({ requireAuth: async () => ({ userId: "u1", restaurantId: "r1", role: "admin" }), isNextResponse: () => false }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn() } }));
vi.mock("@/lib/projections", () => ({ menuDetailInclude: {}, projectMenuDetail: (m: unknown) => m }));
import { POST } from "@/app/api/menus/[id]/items/route";
import { PATCH } from "@/app/api/menus/[id]/items/[itemId]/route";
const params = Promise.resolve({ id: "m1", itemId: "i1" });
const request = (method: string, body: unknown) => new NextRequest("https://test.local/api/menus/m1/items/i1", { method, body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks();
  db.menuFolder.findUnique.mockResolvedValue({ id: "m1", restaurantId: "r1", deletedAt: null });
  db.recipe.findUnique.mockResolvedValue({ id: "recipe1", restaurantId: "r1", deletedAt: null });
  db.menuItem.findUnique.mockResolvedValue({ id: "i1", menuFolderId: "m1", menuFolder: { restaurantId: "r1", deletedAt: null } });
  db.menuItem.findFirst.mockResolvedValue(null);
  db.menuItem.create.mockResolvedValue({ id: "i2" });
  db.menuSection.count.mockResolvedValue(0);
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db));
});
describe("menu item ownership", () => {
  it("rechaza añadir un plato a una sección de otro menú", async () => {
    const res = await POST(request("POST", { recipeId: "recipe1", sectionId: "foreign", price: 1000 }), { params });
    expect(res.status).toBe(400);
    expect(db.menuSection.count).toHaveBeenCalledWith({ where: { id: "foreign", menuFolderId: "m1" } });
    expect(db.menuItem.create).not.toHaveBeenCalled();
  });
  it("rechaza mover un plato a una sección ajena sin escribir nada", async () => {
    const res = await PATCH(request("PATCH", { sectionId: "foreign", price: 2000 }), { params });
    expect(res.status).toBe(400);
    expect(db.menuItem.update).not.toHaveBeenCalled();
  });
  it("permite quitar la sección de un plato", async () => {
    const res = await PATCH(request("PATCH", { sectionId: null }), { params });
    expect(res.status).toBe(200);
    expect(db.menuSection.count).not.toHaveBeenCalled();
    expect(db.menuItem.update).toHaveBeenCalledWith({ where: { id: "i1" }, data: { sectionId: null } });
  });
  it("rechaza cambios de platos en un menú retirado", async () => {
    db.menuItem.findUnique.mockResolvedValue({ id: "i1", menuFolderId: "m1", menuFolder: { restaurantId: "r1", deletedAt: new Date() } });
    expect((await PATCH(request("PATCH", { price: 2000 }), { params })).status).toBe(404);
    expect(db.menuItem.update).not.toHaveBeenCalled();
  });
});
