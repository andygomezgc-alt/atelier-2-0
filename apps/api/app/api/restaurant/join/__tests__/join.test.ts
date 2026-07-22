import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// prisma mock: solo lo que toca el join.
const user = { updateMany: vi.fn() };
const restaurant = { findUnique: vi.fn() };

vi.mock("@atelier/db", () => ({ prisma: { user, restaurant } }));

// Auth: bypass del JWT/sesión, devolvemos un ctx fijo.
vi.mock("@/lib/permissions-guard", () => ({
  requireAuth: vi.fn(),
  isNextResponse: (v: unknown) =>
    typeof v === "object" && v !== null && "status" in v && "headers" in v,
}));

// rate-limit siempre ok (el caso 429 no es el foco acá).
vi.mock("@/lib/rate-limit", () => ({ rateLimit: () => ({ ok: true }) }));

let route: typeof import("../route");
let requireAuth: ReturnType<typeof vi.fn>;

beforeAll(async () => {
  route = await import("../route");
  const guard = await import("@/lib/permissions-guard");
  requireAuth = guard.requireAuth as unknown as ReturnType<typeof vi.fn>;
});

beforeEach(() => {
  user.updateMany.mockReset();
  restaurant.findUnique.mockReset();
  requireAuth.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

function post(code = "ABCD") {
  return route.POST(
    new NextRequest("http://localhost/api/restaurant/join", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    }),
  );
}

describe("POST /api/restaurant/join", () => {
  it("usuario libre + código válido → une con guard atómico restaurantId: null", async () => {
    requireAuth.mockResolvedValue({ userId: "u1", restaurantId: null });
    restaurant.findUnique.mockResolvedValue({ id: "r1", name: "Kokoo" });
    user.updateMany.mockResolvedValue({ count: 1 });

    const res = await post("kokoo1");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      restaurantId: "r1",
      restaurantName: "Kokoo",
      role: "viewer",
    });
    // El guard `restaurantId: null` es lo que cierra la carrera.
    expect(user.updateMany).toHaveBeenCalledWith({
      where: { id: "u1", restaurantId: null },
      data: { restaurantId: "r1", role: "viewer" },
    });
  });

  it("carrera: el usuario ya tiene restaurante (updateMany count 0) → 409 already_in_restaurant", async () => {
    // ctx.restaurantId del token está rancio (null) y pasa el primer check, pero
    // el guard atómico no matchea porque el usuario ya se unió → count 0.
    requireAuth.mockResolvedValue({ userId: "u1", restaurantId: null });
    restaurant.findUnique.mockResolvedValue({ id: "r1", name: "Kokoo" });
    user.updateMany.mockResolvedValue({ count: 0 });

    const res = await post("kokoo1");

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("already_in_restaurant");
  });
});
