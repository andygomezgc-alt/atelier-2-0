import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Prisma mock (vi.hoisted: el factory de vi.mock se eleva). ---
const { db } = vi.hoisted(() => {
  const product = { findMany: vi.fn(), update: vi.fn() };
  const recipeIngredient = { findMany: vi.fn() };
  const auditLog = { create: vi.fn() };
  const $transaction = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
    cb({ product: { update: product.update }, auditLog: { create: auditLog.create } }),
  );
  return { db: { product, recipeIngredient, auditLog, $transaction } };
});

vi.mock("@atelier/db", () => ({ prisma: db }));

import { recalcCriticalityForRestaurant } from "./recalc";
import { defaultCriticality } from "./criticality";

beforeEach(() => {
  db.product.findMany.mockReset();
  db.product.update.mockReset();
  db.recipeIngredient.findMany.mockReset();
  db.auditLog.create.mockReset();
  db.$transaction.mockClear();
});

describe("defaultCriticality (pura)", () => {
  it("pescado y carne → alta", () => {
    expect(defaultCriticality("pescado", "merluza")).toBe("alta");
    expect(defaultCriticality("carne", "ternera")).toBe("alta");
  });
  it("verdura/fruta/lacteo/panaderia/seco → media", () => {
    expect(defaultCriticality("verdura", "zanahoria")).toBe("media");
    expect(defaultCriticality("seco", "harina")).toBe("media");
  });
  it("especia/hierba/vinagre_aceite/otro → baja", () => {
    expect(defaultCriticality("especia", "pimienta")).toBe("baja");
    expect(defaultCriticality("otro", "servilleta")).toBe("baja");
  });
  it("excepción por nombre (ej. trufa) fuerza alta aunque la categoría sea baja", () => {
    // trufa cae en categoría 'verdura' (media) pero el patrón la sube a alta.
    expect(defaultCriticality("verdura", "Trufa negra")).toBe("alta");
  });
});

describe("recalcCriticalityForRestaurant", () => {
  // R1: productA (100€, sin merma) + productB (10€) → total 110.
  // share A = 100/110 = 0.909 (>15% → económico → alta)
  // share B = 10/110  = 0.091 (≤15% → default por categoría)
  function seedR1() {
    db.product.findMany.mockResolvedValue([
      {
        id: "A", name: "salsa base", category: "verdura", criticality: "media",
        criticalityManual: false, precioCompra: 100, mermaPct: 0,
        recipeIngredients: [{ recipeId: "R1" }],
      },
      {
        id: "B", name: "entraña", category: "carne", criticality: "baja",
        criticalityManual: false, precioCompra: 10, mermaPct: 0,
        recipeIngredients: [{ recipeId: "R1" }],
      },
      {
        id: "C", name: "sal", category: "otro", criticality: "alta",
        criticalityManual: true, precioCompra: 1, mermaPct: 0,
        recipeIngredients: [{ recipeId: "R1" }],
      },
    ]);
    db.recipeIngredient.findMany.mockResolvedValue([
      { recipeId: "R1", productId: "A", product: { precioCompra: 100, mermaPct: 0 } },
      { recipeId: "R1", productId: "B", product: { precioCompra: 10, mermaPct: 0 } },
    ]);
  }

  it("sube a alta el producto que pesa >15% del costo (motivo económico)", async () => {
    seedR1();
    const rep = await recalcCriticalityForRestaurant("r1", "actor1");
    const a = rep.changes.find((c) => c.productId === "A");
    expect(a).toBeDefined();
    expect(a!.to).toBe("alta");
    expect(a!.reason).toBe("economic");
    expect(a!.maxShare).toBeGreaterThan(0.15);
  });

  it("al producto liviano le aplica la criticidad por categoría", async () => {
    seedR1();
    const rep = await recalcCriticalityForRestaurant("r1", "actor1");
    // B es carne (default alta) y estaba en 'baja' → cambia a alta por default.
    const b = rep.changes.find((c) => c.productId === "B");
    expect(b!.to).toBe("alta");
    expect(b!.reason).toBe("default");
  });

  it("respeta criticalityManual (no lo toca, lo cuenta como skipped)", async () => {
    seedR1();
    const rep = await recalcCriticalityForRestaurant("r1", "actor1");
    expect(rep.summary.skippedManual).toBe(1);
    expect(rep.changes.find((c) => c.productId === "C")).toBeUndefined();
  });

  it("dryRun no escribe nada", async () => {
    seedR1();
    const rep = await recalcCriticalityForRestaurant("r1", "actor1", { dryRun: true });
    expect(rep.applied).toBe(false);
    expect(db.product.update).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("aplica los cambios y deja rastro en AuditLog", async () => {
    seedR1();
    const rep = await recalcCriticalityForRestaurant("r1", "actor1");
    expect(rep.applied).toBe(true);
    expect(db.product.update).toHaveBeenCalled();
    expect(db.auditLog.create).toHaveBeenCalledOnce();
  });

  it("sin recetas no rompe y no propone cambios económicos", async () => {
    db.product.findMany.mockResolvedValue([
      {
        id: "A", name: "harina", category: "seco", criticality: "media",
        criticalityManual: false, precioCompra: 5, mermaPct: 0,
        recipeIngredients: [],
      },
    ]);
    db.recipeIngredient.findMany.mockResolvedValue([]);
    const rep = await recalcCriticalityForRestaurant("r1", null);
    // harina=seco default media, ya estaba media → sin cambios.
    expect(rep.changes).toHaveLength(0);
  });
});
