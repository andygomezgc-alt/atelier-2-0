import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { db, guard } = vi.hoisted(() => ({
  db: { product: { findUnique: vi.fn(), create: vi.fn() } },
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
  projectProductDetail: (p: { id: string; name: string; estado: string }) => ({
    id: p.id,
    name: p.name,
    estado: p.estado,
  }),
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import * as route from "../route";

function post(id = "prod-1") {
  return route.POST(new NextRequest(`https://t.local/api/products/${id}/duplicate`, { method: "POST" }), {
    params: Promise.resolve({ id }),
  });
}

const SOURCE = {
  id: "prod-1",
  restaurantId: "r1",
  deletedAt: null,
  name: "Ricciola",
  category: "pescado",
  pezzatura: "2-4 kg",
  pezzaturaMode: "g_per_piece",
  pezzaturaMin: 2000,
  pezzaturaMax: 4000,
  unidadCompra: "kg",
  precioCompra: 3200,
  mermaPct: 15,
  mermaOrigen: "medida",
  proveedor: "Pescadería X",
  notas: "manejar en frío",
  allergen: "pescado",
  estado: "activo",
  aliases: ["seriola", "hamachi"],
  criticality: "alta",
  criticalityManual: true,
};

beforeEach(() => {
  db.product.findUnique.mockReset();
  db.product.create.mockReset().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "prod-2",
    ...data,
  }));
  guard.requireAuth.mockReset().mockResolvedValue({ userId: "u1", restaurantId: "r1", role: "chef_executive" });
});

describe("POST /api/products/[id]/duplicate", () => {
  it("clona el producto como borrador con (copia) y sin aliases", async () => {
    db.product.findUnique.mockResolvedValueOnce(SOURCE);
    const res = await post("prod-1");
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe("Ricciola (copia)");
    expect(body.estado).toBe("borrador");

    const createArg = db.product.create.mock.calls[0]![0];
    expect(createArg.data.name).toBe("Ricciola (copia)");
    expect(createArg.data.estado).toBe("borrador");
    expect(createArg.data.aliases).toEqual([]);
    // Campos clonados tal cual.
    expect(createArg.data.category).toBe("pescado");
    expect(createArg.data.precioCompra).toBe(3200);
    expect(createArg.data.mermaPct).toBe(15);
    expect(createArg.data.mermaOrigen).toBe("medida");
    expect(createArg.data.pezzaturaMode).toBe("g_per_piece");
    expect(createArg.data.proveedor).toBe("Pescadería X");
    expect(createArg.data.notas).toBe("manejar en frío");
    expect(createArg.data.allergen).toBe("pescado");
    expect(createArg.data.criticality).toBe("alta");
    expect(createArg.data.criticalityManual).toBe(true);
    expect(createArg.data.restaurantId).toBe("r1");
  });

  it("404 si el producto no existe", async () => {
    db.product.findUnique.mockResolvedValueOnce(null);
    const res = await post("nope");
    expect(res.status).toBe(404);
    expect(db.product.create).not.toHaveBeenCalled();
  });

  it("404 si el origen está borrado (soft-delete)", async () => {
    db.product.findUnique.mockResolvedValueOnce({ ...SOURCE, deletedAt: new Date() });
    const res = await post("prod-1");
    expect(res.status).toBe(404);
    expect(db.product.create).not.toHaveBeenCalled();
  });

  it("404 si es de otro restaurante (anti-IDOR)", async () => {
    db.product.findUnique.mockResolvedValueOnce({ ...SOURCE, restaurantId: "otro" });
    const res = await post("prod-1");
    expect(res.status).toBe(404);
    expect(db.product.create).not.toHaveBeenCalled();
  });
});
