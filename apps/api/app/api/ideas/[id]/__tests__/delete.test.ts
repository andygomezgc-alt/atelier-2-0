import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// --- Prisma mock ---
const idea = {
  findUnique: vi.fn(),
  delete: vi.fn(),
};

vi.mock("@atelier/db", () => ({
  prisma: { idea },
}));

// --- Auth mock: bypass real JWT/session, return a fixed context. ---
vi.mock("@/lib/permissions-guard", () => ({
  requireAuth: vi.fn(),
  isNextResponse: (v: unknown) =>
    typeof v === "object" && v !== null && "status" in v && "headers" in v,
}));

// --- Logger mock (no-op). ---
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

let route: typeof import("../route");
let requireAuth: ReturnType<typeof vi.fn>;

beforeAll(async () => {
  route = await import("../route");
  const guard = await import("@/lib/permissions-guard");
  requireAuth = guard.requireAuth as unknown as ReturnType<typeof vi.fn>;
});

beforeEach(() => {
  idea.findUnique.mockReset();
  idea.delete.mockReset();
  requireAuth.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

const fakeReq = () => new NextRequest("http://localhost/api/ideas/idea-1", { method: "DELETE" });
const params = Promise.resolve({ id: "idea-1" });
const ctx = { userId: "user-1", role: "admin" as const, restaurantId: "rest-1" };

describe("DELETE /api/ideas/[id]", () => {
  it("returns 200 and deletes when idea exists in restaurant", async () => {
    requireAuth.mockResolvedValue(ctx);
    idea.findUnique.mockResolvedValue({ id: "idea-1", restaurantId: "rest-1" });
    idea.delete.mockResolvedValue({ id: "idea-1" });

    const res = await route.DELETE(fakeReq(), { params });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(idea.delete).toHaveBeenCalledWith({ where: { id: "idea-1" } });
  });

  it("returns 404 when idea not found", async () => {
    requireAuth.mockResolvedValue(ctx);
    idea.findUnique.mockResolvedValue(null);

    const res = await route.DELETE(fakeReq(), { params });

    expect(res.status).toBe(404);
    expect(idea.delete).not.toHaveBeenCalled();
  });

  it("returns 404 when idea belongs to a different restaurant (cross-tenant guard)", async () => {
    requireAuth.mockResolvedValue(ctx);
    idea.findUnique.mockResolvedValue({ id: "idea-1", restaurantId: "rest-OTHER" });

    const res = await route.DELETE(fakeReq(), { params });

    expect(res.status).toBe(404);
    expect(idea.delete).not.toHaveBeenCalled();
  });

  it("propagates auth response when requireAuth denies", async () => {
    const denied = new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
    requireAuth.mockResolvedValue(denied);

    const res = await route.DELETE(fakeReq(), { params });

    expect(res.status).toBe(401);
    expect(idea.findUnique).not.toHaveBeenCalled();
  });
});
