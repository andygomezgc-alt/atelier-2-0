import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { can, type Permission } from "@atelier/shared";
const h = vi.hoisted(() => ({ role: "viewer" as "viewer" | "admin", restaurant: vi.fn(), recipe: vi.fn() }));
vi.mock("@atelier/db", () => ({ prisma: { restaurant: { findUnique: h.restaurant }, recipe: { findUnique: h.recipe, findMany: h.recipe } } }));
vi.mock("@/lib/permissions-guard", () => ({
  requireAuth: async (_req: unknown, permission?: Permission) => permission && !can(h.role, permission)
    ? NextResponse.json({ error: "Forbidden" }, { status: 403 })
    : { userId: "u1", restaurantId: "r1", role: h.role },
  isNextResponse: (value: unknown) => value instanceof NextResponse,
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/pdf/render", () => ({ renderHtmlToPdf: vi.fn() }));
import { GET as getRestaurant } from "@/app/api/restaurant/route";
import { GET as getRecipe } from "@/app/api/recipes/[id]/route";
import { GET as listRecipes } from "@/app/api/recipes/route";
import { GET as recipePdf } from "@/app/api/recipes/[id]/pdf/route";
import { GET as recipesPdf } from "@/app/api/recipes/export/pdf/route";
const req = new NextRequest("https://test.local/api/recipes/r1");
const params = Promise.resolve({ id: "r1" });
beforeEach(() => {
  h.role = "viewer";
  h.recipe.mockReset().mockResolvedValue(null);
  h.restaurant.mockReset().mockResolvedValue({ id: "r1", name: "Casa", identityLine: null, photoUrl: null, inviteCode: "PRIVATE123", users: [] });
});
describe("server read permissions", () => {
  it("no devuelve el código de invitación a un viewer", async () => {
    const res = await getRestaurant(req);
    expect(res.status).toBe(200);
    expect(await res.text()).not.toContain("PRIVATE123");
  });
  it("conserva el código para el administrador", async () => {
    h.role = "admin";
    expect(await (await getRestaurant(req)).text()).toContain("PRIVATE123");
  });
  it.each(["detail", "list", "pdf", "export"])("protege recetas: %s", async (kind) => {
    h.recipe.mockResolvedValue(kind === "list" ? [] : null);
    const res = kind === "detail" ? await getRecipe(req, { params }) : kind === "list" ? await listRecipes(req) : kind === "pdf" ? await recipePdf(req, { params }) : await recipesPdf(req);
    expect(res.status).toBe(403);
    expect(h.recipe).not.toHaveBeenCalled();
  });
});
