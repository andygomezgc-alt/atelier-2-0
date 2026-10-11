import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const h = vi.hoisted(() => ({
  ctx: { restaurantId: "restaurant-a", userId: "chef-a", role: "sous_chef" },
  findMany: vi.fn(),
}));
vi.mock("@atelier/db", () => ({ prisma: { idea: { findMany: h.findMany } } }));
vi.mock("@/lib/permissions-guard", () => ({
  requireAuth: async () => h.ctx,
  isNextResponse: (value: unknown) => value instanceof NextResponse,
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/projections", () => ({ ideaInclude: {}, projectIdea: (idea: unknown) => idea }));
import { GET } from "../route";

const request = () => new NextRequest("https://atelier.test/api/ideas");
beforeEach(() => {
  vi.resetAllMocks();
  h.findMany.mockResolvedValue([{ id: "idea-1", authorId: "chef-a" }]);
});

describe("GET /api/ideas", () => {
  it.each(["sous_chef", "admin"])("lists only the caller's own ideas (%s)", async (role) => {
    h.ctx = { restaurantId: "restaurant-a", userId: "chef-a", role };
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: "idea-1", authorId: "chef-a" }]);
    expect(h.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { restaurantId: "restaurant-a", authorId: "chef-a", status: { not: "archived" } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }));
  });
});
