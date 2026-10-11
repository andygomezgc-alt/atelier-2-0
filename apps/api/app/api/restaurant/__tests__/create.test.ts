import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { db, auth } = vi.hoisted(() => ({
  db: {
    restaurant: { create: vi.fn() },
    user: { updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
  auth: vi.fn(),
}));

vi.mock("@atelier/db", () => ({ prisma: db }));
vi.mock("@/lib/permissions-guard", () => ({
  requireAuth: auth,
  isNextResponse: (value: unknown) => value instanceof Response,
}));
vi.mock("@atelier/shared/invite-code", () => ({ generateInviteCode: () => "KOKOO-TEST" }));
vi.mock("@/lib/projections", () => ({ restaurantInclude: {}, projectRestaurant: vi.fn() }));

import { POST } from "../route";

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ userId: "u1", restaurantId: null, role: "viewer" });
  db.restaurant.create.mockResolvedValue({ id: "r1", name: "Kokoo", inviteCode: "KOKOO-TEST" });
  db.user.updateMany.mockResolvedValue({ count: 1 });
  db.$transaction.mockImplementation((fn: (tx: typeof db) => unknown) => fn(db));
});

function post(body: unknown) {
  return POST(new NextRequest("http://localhost/api/restaurant", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer test" },
    body: JSON.stringify(body),
  }));
}

describe("POST /api/restaurant", () => {
  it("stores a trimmed city", async () => {
    const response = await post({ name: "Kokoo", city: "  Ancona  " });
    expect(response.status).toBe(201);
    expect(db.restaurant.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: "Kokoo", city: "Ancona" }),
    });
  });

  it.each([
    ["empty", { city: "" }],
    ["blank", { city: " \t " }],
    ["omitted", {}],
  ])("stores null when city is %s", async (_label, city) => {
    const response = await post({ name: "Kokoo", ...city });
    expect(response.status).toBe(201);
    expect(db.restaurant.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ city: null }),
    });
  });

  it.each([
    ["with city", { city: "Ancona" }],
    ["without city", {}],
  ])("creates memory through the enabled DB default in the restaurant transaction %s", async (_label, city) => {
    db.$transaction.mockImplementationOnce(async (fn: (tx: typeof db) => Promise<unknown>) => {
      expect(db.restaurant.create).not.toHaveBeenCalled();
      expect(db.user.updateMany).not.toHaveBeenCalled();
      const result = await fn(db);
      expect(db.restaurant.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ culinaryMemory: { create: {} } }),
      });
      expect(db.user.updateMany).toHaveBeenCalledWith({
        where: { id: "u1", restaurantId: null },
        data: { restaurantId: "r1", role: "admin" },
      });
      return result;
    });

    const response = await post({ name: "Kokoo", ...city });
    expect(response.status).toBe(201);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.restaurant.create).toHaveBeenCalledTimes(1);
    expect(db.user.updateMany).toHaveBeenCalledTimes(1);
  });
});
