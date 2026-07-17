import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// P2-5 (auditoría seguridad) + P1-2/P2-3/P1-3 (auditoría bugs jul 2026):
//   - invariante "último admin" bajo transacción SERIALIZABLE (+ retry P2034),
//   - updateMany filtrado por restaurantId con verificación de count (P2-3),
//   - rotación del inviteCode dentro de la MISMA tx en la expulsión (P1-3),
//   - audit dentro de la tx (P3-3).
const { db, guard, auditMock, PrismaMock } = vi.hoisted(() => {
  const user = {
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    count: vi.fn(),
  };
  const restaurant = { findUnique: vi.fn(), update: vi.fn() };

  class PrismaClientKnownRequestError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  }
  const Prisma = {
    TransactionIsolationLevel: { Serializable: "Serializable" },
    PrismaClientKnownRequestError,
  };

  const txClient = {
    user: { update: user.update, updateMany: user.updateMany, count: user.count },
    restaurant,
  };
  const $transaction = vi.fn(
    async (cb: (tx: unknown) => Promise<unknown>, _opts?: unknown) => cb(txClient),
  );

  return {
    db: { user, restaurant, $transaction, txClient },
    guard: {
      requireAuth: vi.fn(),
      isNextResponse: (v: unknown) =>
        typeof v === "object" && v !== null && "status" in v && "headers" in v,
    },
    auditMock: vi.fn(),
    PrismaMock: Prisma,
  };
});

vi.mock("@atelier/db", () => ({ prisma: db, Prisma: PrismaMock }));
vi.mock("@/lib/permissions-guard", () => ({
  requireAuth: guard.requireAuth,
  isNextResponse: guard.isNextResponse,
}));
vi.mock("@/lib/audit-log", () => ({ audit: auditMock }));

import * as route from "../route";

function patch(userId: string, body: unknown) {
  const req = new NextRequest(`https://t.local/api/restaurant/staff/${userId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return route.PATCH(req, { params: Promise.resolve({ userId }) });
}

function del(userId: string) {
  const req = new NextRequest(`https://t.local/api/restaurant/staff/${userId}`, {
    method: "DELETE",
  });
  return route.DELETE(req, { params: Promise.resolve({ userId }) });
}

beforeEach(() => {
  db.user.findUnique.mockReset();
  db.user.update.mockReset();
  db.user.updateMany.mockReset();
  db.user.count.mockReset();
  db.restaurant.findUnique.mockReset().mockResolvedValue({ name: "Marché" });
  db.restaurant.update.mockReset().mockResolvedValue({ inviteCode: "MARCHE-NEW123" });
  db.$transaction
    .mockReset()
    .mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(db.txClient));
  auditMock.mockReset();
  guard.requireAuth
    .mockReset()
    .mockResolvedValue({ userId: "actor-1", restaurantId: "r1", role: "admin" });
});

describe("PATCH /api/restaurant/staff/[userId]", () => {
  it("409 last_admin al degradar al ÚNICO admin (no ejecuta el updateMany)", async () => {
    db.user.findUnique.mockResolvedValueOnce({
      id: "target-1",
      restaurantId: "r1",
      role: "admin",
    });
    db.user.count.mockResolvedValueOnce(1);

    const res = await patch("target-1", { role: "viewer" });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "last_admin", code: "last_admin" });
    expect(db.user.updateMany).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("permite degradar a un admin si quedan otros admins", async () => {
    db.user.findUnique.mockResolvedValueOnce({
      id: "target-1",
      restaurantId: "r1",
      role: "admin",
    });
    db.user.count.mockResolvedValueOnce(2);
    db.user.updateMany.mockResolvedValueOnce({ count: 1 });

    const res = await patch("target-1", { role: "viewer" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "target-1", role: "viewer" });
    // P2-3: filtra por restaurantId además del id.
    expect(db.user.updateMany).toHaveBeenCalledWith({
      where: { id: "target-1", restaurantId: "r1" },
      data: { role: "viewer" },
    });
    expect(auditMock).toHaveBeenCalledTimes(1);
  });

  it("no cuenta admins cuando el cambio no degrada a un admin", async () => {
    db.user.findUnique.mockResolvedValueOnce({
      id: "target-1",
      restaurantId: "r1",
      role: "viewer",
    });
    db.user.updateMany.mockResolvedValueOnce({ count: 1 });

    const res = await patch("target-1", { role: "sous_chef" });

    expect(res.status).toBe(200);
    expect(db.user.count).not.toHaveBeenCalled();
  });

  it("P2-3: 404 si el target migró de restaurante entre lectura y escritura (count=0)", async () => {
    db.user.findUnique.mockResolvedValueOnce({
      id: "target-1",
      restaurantId: "r1",
      role: "viewer",
    });
    db.user.updateMany.mockResolvedValueOnce({ count: 0 });

    const res = await patch("target-1", { role: "sous_chef" });

    expect(res.status).toBe(404);
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("P1-2: reintenta ante conflicto de serialización P2034 y termina OK", async () => {
    db.user.findUnique.mockResolvedValueOnce({
      id: "target-1",
      restaurantId: "r1",
      role: "viewer",
    });
    db.user.updateMany.mockResolvedValue({ count: 1 });
    db.$transaction
      .mockReset()
      .mockRejectedValueOnce(
        new PrismaMock.PrismaClientKnownRequestError("write conflict", "P2034"),
      )
      .mockImplementationOnce(async (cb: (tx: unknown) => Promise<unknown>) =>
        cb(db.txClient),
      );

    const res = await patch("target-1", { role: "sous_chef" });

    expect(res.status).toBe(200);
    expect(db.$transaction).toHaveBeenCalledTimes(2);
  });
});

describe("DELETE /api/restaurant/staff/[userId]", () => {
  it("409 last_admin al expulsar al ÚNICO admin (no ejecuta el updateMany)", async () => {
    db.user.findUnique.mockResolvedValueOnce({
      id: "target-1",
      restaurantId: "r1",
      role: "admin",
    });
    db.user.count.mockResolvedValueOnce(1);

    const res = await del("target-1");

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "last_admin", code: "last_admin" });
    expect(db.user.updateMany).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("permite expulsar a un admin si quedan otros admins", async () => {
    db.user.findUnique.mockResolvedValueOnce({
      id: "target-1",
      restaurantId: "r1",
      role: "admin",
    });
    db.user.count.mockResolvedValueOnce(2);
    db.user.updateMany.mockResolvedValueOnce({ count: 1 });

    const res = await del("target-1");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(auditMock).toHaveBeenCalledTimes(1);
  });

  it("P1-3: expulsar rota el inviteCode dentro de la MISMA tx", async () => {
    db.user.findUnique.mockResolvedValueOnce({
      id: "target-1",
      restaurantId: "r1",
      role: "viewer",
    });
    db.user.updateMany.mockResolvedValueOnce({ count: 1 });

    const res = await del("target-1");

    expect(res.status).toBe(200);
    // Se rota el código: update sobre el restaurante con un inviteCode nuevo.
    expect(db.restaurant.update).toHaveBeenCalledTimes(1);
    const call = db.restaurant.update.mock.calls[0][0];
    expect(call.where).toEqual({ id: "r1" });
    expect(typeof call.data.inviteCode).toBe("string");
    expect(call.data.inviteCode.length).toBeGreaterThan(0);
    // Y todo pasó por una única transacción.
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  it("P2-3: 404 si el target migró de restaurante (count=0), sin rotar código", async () => {
    db.user.findUnique.mockResolvedValueOnce({
      id: "target-1",
      restaurantId: "r1",
      role: "viewer",
    });
    db.user.updateMany.mockResolvedValueOnce({ count: 0 });

    const res = await del("target-1");

    expect(res.status).toBe(404);
    expect(db.restaurant.update).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("expulsar a un no-admin nunca cuenta admins", async () => {
    db.user.findUnique.mockResolvedValueOnce({
      id: "target-1",
      restaurantId: "r1",
      role: "viewer",
    });
    db.user.updateMany.mockResolvedValueOnce({ count: 1 });

    const res = await del("target-1");

    expect(res.status).toBe(200);
    expect(db.user.count).not.toHaveBeenCalled();
  });

  it("400 al intentar expulsarte a ti mismo", async () => {
    db.user.findUnique.mockResolvedValueOnce({
      id: "actor-1",
      restaurantId: "r1",
      role: "admin",
    });

    const res = await del("actor-1");

    expect(res.status).toBe(400);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
