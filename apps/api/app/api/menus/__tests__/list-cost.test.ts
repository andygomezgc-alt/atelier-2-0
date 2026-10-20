// Proposal 1: the menu list carries the average dish cost and margin of in-service menus.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { db, auth } = vi.hoisted(() => ({
  db: { menuFolder: { findMany: vi.fn() }, menuItem: { findMany: vi.fn() } },
  auth: { role: "sous_chef" as string },
}));
vi.mock("@atelier/db", () => ({ prisma: db }));
vi.mock("@/lib/permissions-guard", () => ({
  requireAuth: async () => ({ userId: "u1", restaurantId: "r1", role: auth.role }),
  isNextResponse: () => false,
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn() } }));
import { GET } from "../route";

// Prisma.Decimal stand-in: the projection only calls toString().
const dec = (v: number) => ({ toString: () => String(v) });
const oil = {
  id: "ri-oil", position: 0, rawText: "40 g aceite", qty: dec(40), unit: "g", pezzatura: null, mermaOverridePct: null, pesoCalculoG: null,
  product: {
    id: "p-oil", name: "Aceite", criticality: "media", estado: "activo", precioCompra: 500, mermaPct: dec(0), unidadCompra: "l",
    pezzaturaMode: null, pezzaturaMin: null, pezzaturaMax: null, gramosPorLitro: dec(920), allergen: null, allergens: [], allergensReviewed: true,
  },
};
const updatedAt = new Date("2026-10-19T10:00:00Z");
const menus = [
  { id: "m-live", name: "Carta de otoño", season: "Otoño", updatedAt, inService: true, _count: { items: 1 } },
  { id: "m-draft", name: "Borrador", season: null, updatedAt, inService: false, _count: { items: 0 } },
];

function list(query = "") {
  return GET(new NextRequest(`https://test.local/api/menus${query}`));
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.role = "sous_chef";
  db.menuFolder.findMany.mockResolvedValue(menus);
  // 22c of oil for 2 portions = 11c per dish, sold at 1 €.
  db.menuItem.findMany.mockResolvedValue([
    { menuFolderId: "m-live", price: 100, priceUnit: "portion", recipe: { portions: 2, recipeIngredients: [oil] } },
  ]);
});

describe("GET /api/menus — cost summary", () => {
  it("adds the cost summary to in-service menus only, reading only their active dishes", async () => {
    const response = await list();
    expect(response.status).toBe(200);
    const [live, draft] = await response.json();
    expect(live.costSummary).toEqual({ avgDishCostCents: 11, marginPct: 89, pricedDishes: 1, totalDishes: 1 });
    expect(draft).not.toHaveProperty("costSummary");
    expect(db.menuItem.findMany).toHaveBeenCalledOnce();
    expect(db.menuItem.findMany.mock.calls[0]![0].where).toEqual({ menuFolderId: { in: ["m-live"] }, recipe: { deletedAt: null } });
  });

  it("keeps the rest of each menu item as before", async () => {
    const [live, draft] = await (await list()).json();
    expect(live).toMatchObject({ id: "m-live", name: "Carta de otoño", season: "Otoño", itemCount: 1, updatedAt: updatedAt.toISOString(), inService: true });
    expect(draft).toEqual({ id: "m-draft", name: "Borrador", season: null, itemCount: 0, updatedAt: updatedAt.toISOString(), inService: false });
  });

  it("an in-service menu with no fully costed dish gets a null summary", async () => {
    db.menuItem.findMany.mockResolvedValue([]);
    const [live] = await (await list()).json();
    expect(live.costSummary).toBeNull();
  });

  it("the trash never computes costs", async () => {
    const body = await (await list("?trash=true")).json();
    expect(db.menuItem.findMany).not.toHaveBeenCalled();
    expect(body[0]).not.toHaveProperty("costSummary");
  });

  it("a role that cannot see staff recipes gets no costs", async () => {
    auth.role = "guest";
    const body = await (await list()).json();
    expect(db.menuItem.findMany).not.toHaveBeenCalled();
    expect(body[0]).not.toHaveProperty("costSummary");
  });

  it("keeps the dishes of two in-service menus apart, in one query", async () => {
    const winter = { ...menus[0], id: "m-winter", name: "Carta de invierno", _count: { items: 2 } };
    db.menuFolder.findMany.mockResolvedValue([menus[0], winter]);
    db.menuItem.findMany.mockResolvedValue([
      { menuFolderId: "m-live", price: 100, priceUnit: "portion", recipe: { portions: 2, recipeIngredients: [oil] } },
      // 22c of oil for 1 portion, sold at 3 €; the dish sold by weight counts as a dish but not in the numbers.
      { menuFolderId: "m-winter", price: 300, priceUnit: "portion", recipe: { portions: 1, recipeIngredients: [oil] } },
      { menuFolderId: "m-winter", price: 300, priceUnit: "kg", recipe: { portions: 1, recipeIngredients: [oil] } },
    ]);
    const [autumn, winterMenu] = await (await list()).json();
    expect(autumn.costSummary).toEqual({ avgDishCostCents: 11, marginPct: 89, pricedDishes: 1, totalDishes: 1 });
    expect(winterMenu.costSummary).toEqual({ avgDishCostCents: 22, marginPct: 93, pricedDishes: 1, totalDishes: 2 });
    expect(db.menuItem.findMany).toHaveBeenCalledOnce();
    expect(db.menuItem.findMany.mock.calls[0]![0].where.menuFolderId).toEqual({ in: ["m-live", "m-winter"] });
  });

  it("no menu in service means no extra query", async () => {
    db.menuFolder.findMany.mockResolvedValue([menus[1]]);
    await list();
    expect(db.menuItem.findMany).not.toHaveBeenCalled();
  });
});
