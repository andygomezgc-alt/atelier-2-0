import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { can } from "@atelier/shared";
import type { Role } from "@atelier/db";
const { auth, db } = vi.hoisted(() => ({ auth: vi.fn(), db: { chefNote: { deleteMany: vi.fn() } } }));
vi.mock("@/lib/permissions-guard", () => ({ requireAuth: auth, isNextResponse: (v: unknown) => v instanceof Response }));
vi.mock("@atelier/db", () => ({ prisma: db }));
import { DELETE } from "./route";
const del = (headers: Record<string, string> = { authorization: "Bearer test" }) =>
  DELETE(new NextRequest("http://local/api/restaurant/chef-notes/n1", { method: "DELETE", headers }), { params: Promise.resolve({ id: "n1" }) });
let role: Role;
beforeEach(() => {
  vi.resetAllMocks();
  role = "chef_executive";
  auth.mockImplementation(async (_req: unknown, permission: Parameters<typeof can>[1]) =>
    can(role, permission) ? { restaurantId: "mine", role, userId: "u1" } : NextResponse.json({ error: "Forbidden", code: "forbidden" }, { status: 403 }));
  db.chefNote.deleteMany.mockResolvedValue({ count: 1 });
});
describe("DELETE /api/restaurant/chef-notes/[id]", () => {
  it("borra la nota del restaurante autenticado y responde 200", async () => {
    const response = await del();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(auth).toHaveBeenCalledWith(expect.anything(), "approve_recipe");
    expect(db.chefNote.deleteMany).toHaveBeenCalledWith({ where: { id: "n1", restaurantId: "mine" } });
  });
  it("una nota de otro restaurante (o inexistente) responde 404", async () => {
    db.chefNote.deleteMany.mockResolvedValue({ count: 0 });
    const response = await del();
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found" });
  });
  it.each<Role>(["sous_chef", "viewer"])("%s no puede borrar notas", async r => {
    role = r;
    expect((await del()).status).toBe(403);
    expect(db.chefNote.deleteMany).not.toHaveBeenCalled();
  });
  it("sin restaurante responde 403", async () => {
    auth.mockResolvedValue({ restaurantId: null, role: "chef_executive", userId: "u1" });
    expect((await del()).status).toBe(403);
    expect(db.chefNote.deleteMany).not.toHaveBeenCalled();
  });
  it("rechaza borrados web de otro origen", async () => {
    expect((await del({ "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect((await del({ origin: "https://foreign.test" })).status).toBe(403);
    expect(db.chefNote.deleteMany).not.toHaveBeenCalled();
  });
});
