import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const h = vi.hoisted(() => ({
  ctx: { userId: "user-1", role: "sous_chef", restaurantId: "rest-1" },
  findUnique: vi.fn(), update: vi.fn(),
}));
vi.mock("@atelier/db", () => ({ prisma: { idea: { findUnique: h.findUnique, update: h.update } } }));
vi.mock("@/lib/permissions-guard", () => ({
  requireAuth: async () => h.ctx,
  isNextResponse: (value: unknown) => value instanceof NextResponse,
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
import { PATCH } from "../route";

const request = () => new NextRequest("http://localhost/api/ideas/idea-1", {
  method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "Nueva versión" }),
});
const params = () => ({ params: Promise.resolve({ id: "idea-1" }) });
beforeEach(() => {
  vi.resetAllMocks();
  h.ctx = { userId: "user-1", role: "sous_chef", restaurantId: "rest-1" };
});

describe("PATCH /api/ideas/[id]", () => {
  it("updates the caller's own idea", async () => {
    h.findUnique.mockResolvedValue({ id: "idea-1", restaurantId: "rest-1", authorId: "user-1" });
    h.update.mockResolvedValue({ id: "idea-1", text: "Nueva versión", status: "open" });
    const res = await PATCH(request(), params());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "idea-1", text: "Nueva versión", status: "open" });
    expect(h.update).toHaveBeenCalledWith({ where: { id: "idea-1" }, data: { text: "Nueva versión" } });
  });

  it.each(["sous_chef", "admin"])("returns 404 for a teammate's idea without updating it (%s)", async (role) => {
    h.ctx = { userId: "user-1", role, restaurantId: "rest-1" };
    h.findUnique.mockResolvedValue({ id: "idea-1", restaurantId: "rest-1", authorId: "user-2" });
    h.update.mockResolvedValue({ id: "idea-1", text: "Nueva versión", status: "open" });
    const res = await PATCH(request(), params());
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
    expect(h.update).not.toHaveBeenCalled();
  });

  it("returns 404 for an idea of another restaurant", async () => {
    h.findUnique.mockResolvedValue({ id: "idea-1", restaurantId: "rest-OTHER", authorId: "user-1" });
    const res = await PATCH(request(), params());
    expect(res.status).toBe(404);
    expect(h.update).not.toHaveBeenCalled();
  });
});
