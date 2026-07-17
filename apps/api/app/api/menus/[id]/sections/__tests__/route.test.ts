import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// FakePrismaError vive dentro de vi.hoisted a propósito: vi.mock se hoistea
// al tope del archivo, así que solo puede referenciar bindings creados
// también vía vi.hoisted (si no, TDZ al evaluar la factory).
const { db, guard, FakePrismaError } = vi.hoisted(() => {
  class FakePrismaError extends Error {
    code: string;
    constructor(code: string) {
      super("simulated prisma error");
      this.code = code;
    }
  }
  const menuFolder = { findUnique: vi.fn() };
  const menuSection = { aggregate: vi.fn(), create: vi.fn() };
  const $transaction = vi.fn<
    (
      cb: (tx: unknown) => Promise<unknown>,
      _options?: { isolationLevel: string },
    ) => Promise<unknown>
  >(async (cb) =>
    cb({ menuSection: { aggregate: menuSection.aggregate, create: menuSection.create } }),
  );
  return {
    db: { menuFolder, menuSection, $transaction },
    guard: {
      requireAuth: vi.fn(),
      isNextResponse: (v: unknown) =>
        typeof v === "object" && v !== null && "status" in v && "headers" in v,
    },
    FakePrismaError,
  };
});

vi.mock("@atelier/db", () => ({
  prisma: db,
  Prisma: { PrismaClientKnownRequestError: FakePrismaError },
}));
vi.mock("@/lib/permissions-guard", () => ({
  requireAuth: guard.requireAuth,
  isNextResponse: guard.isNextResponse,
}));
vi.mock("@/lib/projections", () => ({
  projectMenuDetail: (m: { id: string }) => ({ id: m.id }),
  menuDetailInclude: {},
}));

import * as route from "../route";

function post(body: unknown = { name: "Entrantes" }, id = "menu-1") {
  return route.POST(
    new NextRequest(`https://t.local/api/menus/${id}/sections`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

beforeEach(() => {
  db.menuFolder.findUnique.mockReset();
  db.menuSection.aggregate.mockReset().mockResolvedValue({ _max: { order: null } });
  db.menuSection.create.mockReset().mockResolvedValue({ id: "sec-1" });
  db.$transaction.mockClear();
  guard.requireAuth
    .mockReset()
    .mockResolvedValue({ userId: "u1", restaurantId: "r1", role: "chef_executive" });
});

describe("POST /api/menus/[id]/sections", () => {
  it("crea la sección con order = max+1 dentro de una transacción Serializable", async () => {
    db.menuFolder.findUnique
      .mockResolvedValueOnce({ id: "menu-1", restaurantId: "r1" })
      .mockResolvedValueOnce({ id: "menu-1" });
    db.menuSection.aggregate.mockResolvedValueOnce({ _max: { order: 2 } });

    const res = await post({ name: "Postres" });

    expect(res.status).toBe(200);
    expect(db.menuSection.create.mock.calls[0]![0].data.order).toBe(3);
    const txOpts = db.$transaction.mock.calls[0]![1];
    expect(txOpts?.isolationLevel).toBe("Serializable");
  });

  it("404 si el menú no existe o es de otro restaurante", async () => {
    db.menuFolder.findUnique.mockResolvedValueOnce({ id: "menu-1", restaurantId: "otro" });
    const res = await post();
    expect(res.status).toBe(404);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("400 si el body no valida (name vacío)", async () => {
    db.menuFolder.findUnique.mockResolvedValueOnce({ id: "menu-1", restaurantId: "r1" });
    const res = await post({ name: "" });
    expect(res.status).toBe(400);
  });

  // P2-4 (auditoría jul 2026): dos POST casi simultáneos pueden chocar en
  // Postgres con P2034 (Serializable). El route debe reintentar.
  it("retry ante P2034: la primera transacción choca, la segunda pega", async () => {
    db.menuFolder.findUnique
      .mockResolvedValueOnce({ id: "menu-1", restaurantId: "r1" })
      .mockResolvedValueOnce({ id: "menu-1" });
    db.menuSection.aggregate.mockResolvedValue({ _max: { order: 1 } });
    db.$transaction.mockImplementationOnce(async () => {
      throw new FakePrismaError("P2034");
    });

    const res = await post({ name: "Postres" });

    expect(res.status).toBe(200);
    expect(db.$transaction).toHaveBeenCalledTimes(2);
    expect(db.menuSection.create).toHaveBeenCalledTimes(1);
  });

  it("agota los reintentos y propaga el error si P2034 persiste", async () => {
    db.menuFolder.findUnique.mockResolvedValueOnce({ id: "menu-1", restaurantId: "r1" });
    db.$transaction.mockImplementation(async () => {
      throw new FakePrismaError("P2034");
    });

    await expect(post({ name: "Postres" })).rejects.toThrow();
    expect(db.$transaction).toHaveBeenCalledTimes(3);
  });

  it("un error que no es P2034 no reintenta", async () => {
    db.menuFolder.findUnique.mockResolvedValueOnce({ id: "menu-1", restaurantId: "r1" });
    db.$transaction.mockImplementation(async () => {
      throw new Error("db offline");
    });

    await expect(post({ name: "Postres" })).rejects.toThrow("db offline");
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });
});
