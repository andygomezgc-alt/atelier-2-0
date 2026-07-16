import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// P2-5 (auditoría jul 2026): invariante "último admin" — PATCH (degradar) y
// DELETE (expulsar) sobre el último admin del restaurante deben rechazarse
// con 409, sin ejecutar el cambio.
const { db, guard, auditMock } = vi.hoisted(() => {
  const user = { findUnique: vi.fn(), update: vi.fn(), count: vi.fn() };
  const $transaction = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
    cb({ user: { update: user.update, count: user.count } }),
  );
  return {
    db: { user, $transaction },
    guard: {
      requireAuth: vi.fn(),
      isNextResponse: (v: unknown) =>
        typeof v === "object" && v !== null && "status" in v && "headers" in v,
    },
    auditMock: vi.fn(),
  };
});

vi.mock("@atelier/db", () => ({ prisma: db }));
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
  db.user.count.mockReset();
  db.$transaction.mockClear();
  auditMock.mockReset();
  guard.requireAuth
    .mockReset()
    .mockResolvedValue({ userId: "actor-1", restaurantId: "r1", role: "admin" });
});

describe("PATCH /api/restaurant/staff/[userId]", () => {
  it("409 last_admin al degradar al ÚNICO admin del restaurante (no ejecuta el update)", async () => {
    db.user.findUnique.mockResolvedValueOnce({
      id: "target-1",
      restaurantId: "r1",
      role: "admin",
    });
    db.user.count.mockResolvedValueOnce(1);

    const res = await patch("target-1", { role: "viewer" });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "last_admin", code: "last_admin" });
    expect(db.user.update).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("permite degradar a un admin si quedan otros admins", async () => {
    db.user.findUnique.mockResolvedValueOnce({
      id: "target-1",
      restaurantId: "r1",
      role: "admin",
    });
    db.user.count.mockResolvedValueOnce(2);
    db.user.update.mockResolvedValueOnce({ id: "target-1", role: "viewer" });

    const res = await patch("target-1", { role: "viewer" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "target-1", role: "viewer" });
    expect(auditMock).toHaveBeenCalledTimes(1);
  });

  it("no cuenta admins cuando el cambio no degrada a un admin (target ya no-admin)", async () => {
    db.user.findUnique.mockResolvedValueOnce({
      id: "target-1",
      restaurantId: "r1",
      role: "viewer",
    });
    db.user.update.mockResolvedValueOnce({ id: "target-1", role: "sous_chef" });

    const res = await patch("target-1", { role: "sous_chef" });

    expect(res.status).toBe(200);
    expect(db.user.count).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/restaurant/staff/[userId]", () => {
  it("409 last_admin al expulsar al ÚNICO admin del restaurante (no ejecuta el update)", async () => {
    db.user.findUnique.mockResolvedValueOnce({
      id: "target-1",
      restaurantId: "r1",
      role: "admin",
    });
    db.user.count.mockResolvedValueOnce(1);

    const res = await del("target-1");

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "last_admin", code: "last_admin" });
    expect(db.user.update).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("permite expulsar a un admin si quedan otros admins", async () => {
    db.user.findUnique.mockResolvedValueOnce({
      id: "target-1",
      restaurantId: "r1",
      role: "admin",
    });
    db.user.count.mockResolvedValueOnce(2);
    db.user.update.mockResolvedValueOnce({ id: "target-1", restaurantId: null });

    const res = await del("target-1");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(auditMock).toHaveBeenCalledTimes(1);
  });

  it("expulsar a un no-admin nunca cuenta admins", async () => {
    db.user.findUnique.mockResolvedValueOnce({
      id: "target-1",
      restaurantId: "r1",
      role: "viewer",
    });
    db.user.update.mockResolvedValueOnce({ id: "target-1", restaurantId: null });

    const res = await del("target-1");

    expect(res.status).toBe(200);
    expect(db.user.count).not.toHaveBeenCalled();
  });
});
