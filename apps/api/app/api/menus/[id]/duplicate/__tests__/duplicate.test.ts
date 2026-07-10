import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { db, guard } = vi.hoisted(() => {
  const menuFolder = { findUnique: vi.fn(), create: vi.fn() };
  const menuSection = { create: vi.fn() };
  const menuItem = { createMany: vi.fn() };
  const menuClientOverride = { create: vi.fn() };
  const $transaction = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      menuFolder: { create: menuFolder.create, findUnique: menuFolder.findUnique },
      menuSection,
      menuItem,
      menuClientOverride,
    }),
  );
  return {
    db: { menuFolder, menuSection, menuItem, menuClientOverride, $transaction },
    guard: {
      requireAuth: vi.fn(),
      isNextResponse: (v: unknown) =>
        typeof v === "object" && v !== null && "status" in v && "headers" in v,
    },
  };
});

vi.mock("@atelier/db", () => ({ prisma: db }));
vi.mock("@/lib/permissions-guard", () => ({
  requireAuth: guard.requireAuth,
  isNextResponse: guard.isNextResponse,
}));
vi.mock("@/lib/projections", () => ({
  projectMenuDetail: (m: { id: string; name: string }) => ({ id: m.id, name: m.name }),
  menuDetailInclude: {},
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import * as route from "../route";

function post(id = "menu-1") {
  return route.POST(new NextRequest(`https://t.local/api/menus/${id}/duplicate`, { method: "POST" }), {
    params: Promise.resolve({ id }),
  });
}

const SOURCE = {
  id: "menu-1",
  restaurantId: "r1",
  name: "Primavera",
  season: "Primavera 2026",
  presentationStyle: "elegant",
  showAllergensInPdf: true,
  inService: true,
  sections: [{ id: "s1", name: "Antipasti", order: 0 }],
  items: [
    { sectionId: "s1", recipeId: "rec1", customName: null, customDesc: null, price: 1800, order: 0 },
    { sectionId: null, recipeId: "rec2", customName: "Especial", customDesc: null, price: 2200, order: 1 },
  ],
  clientOverride: { overrides: { menuName: "Carta" } },
};

beforeEach(() => {
  db.menuFolder.findUnique.mockReset();
  db.menuFolder.create.mockReset().mockResolvedValue({ id: "menu-2" });
  db.menuSection.create.mockReset().mockResolvedValue({ id: "ns1" });
  db.menuItem.createMany.mockReset().mockResolvedValue({ count: 2 });
  db.menuClientOverride.create.mockReset().mockResolvedValue({});
  db.$transaction.mockClear();
  guard.requireAuth.mockReset().mockResolvedValue({ userId: "u1", restaurantId: "r1", role: "chef_executive" });
});

describe("POST /api/menus/[id]/duplicate", () => {
  it("clona menú con (copia), fuera de servicio, y mapea ítems a las secciones nuevas", async () => {
    db.menuFolder.findUnique
      .mockResolvedValueOnce(SOURCE)
      .mockResolvedValueOnce({ id: "menu-2", name: "Primavera (copia)" });

    const res = await post("menu-1");
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe("Primavera (copia)");

    const folderArg = db.menuFolder.create.mock.calls[0]![0];
    expect(folderArg.data.name).toBe("Primavera (copia)");
    expect(folderArg.data.inService).toBe(false); // una copia no entra en servicio sola

    // Sección clonada, y el ítem con sección apunta a la NUEVA sección (ns1).
    expect(db.menuSection.create).toHaveBeenCalledOnce();
    const itemsArg = db.menuItem.createMany.mock.calls[0]![0];
    expect(itemsArg.data[0].sectionId).toBe("ns1");
    expect(itemsArg.data[1].sectionId).toBeNull(); // el ítem sin sección queda sin sección
    expect(itemsArg.data[0].recipeId).toBe("rec1");
    // Override del PDF cliente clonado.
    expect(db.menuClientOverride.create).toHaveBeenCalledOnce();
  });

  it("404 si el menú no existe", async () => {
    db.menuFolder.findUnique.mockResolvedValueOnce(null);
    const res = await post("nope");
    expect(res.status).toBe(404);
    expect(db.menuFolder.create).not.toHaveBeenCalled();
  });

  it("404 si es de otro restaurante (anti-IDOR)", async () => {
    db.menuFolder.findUnique.mockResolvedValueOnce({ ...SOURCE, restaurantId: "otro" });
    const res = await post("menu-1");
    expect(res.status).toBe(404);
  });
});
