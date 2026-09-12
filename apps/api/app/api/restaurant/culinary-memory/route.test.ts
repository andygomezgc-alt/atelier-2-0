import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
const { auth, get, patch } = vi.hoisted(() => ({ auth: vi.fn(), get: vi.fn(), patch: vi.fn() }));
vi.mock("@/lib/permissions-guard", () => ({ requireAuth: auth, isNextResponse: (v: unknown) => v instanceof Response }));
vi.mock("@/lib/culinary-memory/service", () => ({ getCulinaryMemory: get, patchCulinaryMemory: patch, MemoryConflict: class extends Error {} }));
import { GET, PATCH, DELETE } from "./route";
const req = (body: unknown, method = "PATCH", headers = {}) => new NextRequest("http://local/api/restaurant/culinary-memory", { method, headers: { authorization: "Bearer test", ...headers }, body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); auth.mockResolvedValue({ restaurantId: "mine", role: "chef_executive", userId: "u1" }); get.mockResolvedValue({ enabled: false }); patch.mockResolvedValue({ enabled: true }); });
describe("culinary memory route", () => {
  it("usa el restaurante autenticado, nunca uno recibido del cliente", async () => {
    expect((await PATCH(req({ expectedVersion: 0, enabled: true }))).status).toBe(200);
    expect(patch).toHaveBeenCalledWith("mine", { expectedVersion: 0, enabled: true }, false);
    expect((await PATCH(req({ expectedVersion: 0, restaurantId: "other" }))).status).toBe(400);
  });
  it("aplica permisos de consulta y edición", async () => {
    auth.mockResolvedValueOnce({ restaurantId: "mine", role: "sous_chef" });
    await GET(new NextRequest("http://local")); expect(get).toHaveBeenCalledWith("mine", false);
    expect(auth).toHaveBeenCalledWith(expect.anything(), "view_staff_recipe");
    auth.mockResolvedValueOnce(NextResponse.json({}, { status: 403 }));
    expect((await PATCH(req({ expectedVersion: 0 }))).status).toBe(403); expect(patch).not.toHaveBeenCalled();
    expect(auth).toHaveBeenLastCalledWith(expect.anything(), "approve_recipe");
  });
  it("borrar exige versión y utiliza la misma protección de concurrencia", async () => {
    expect((await DELETE(req({ expectedVersion: 3 }, "DELETE"))).status).toBe(200);
    expect(patch).toHaveBeenCalledWith("mine", { expectedVersion: 3 }, true);
    expect((await DELETE(req({}, "DELETE"))).status).toBe(400);
  });
  it("rechaza escrituras web de otro origen", async () => {
    expect((await PATCH(req({ expectedVersion: 0 }, "PATCH", { authorization: "", origin: "https://foreign.test" }))).status).toBe(403);
    expect(patch).not.toHaveBeenCalled();
  });
});
