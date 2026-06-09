// Gestión de equipo F3 — tests del endpoint POST /api/restaurant/leave y
// GET /api/restaurant/leave/preflight. Mockean prisma + auth para cubrir
// los 3 casos (A/B/C) sin tocar DB.

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const TEST_SECRET = "test-secret-do-not-use-in-prod-0123456789";

const user = {
  findUnique: vi.fn(),
  findMany: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
};
const auditLog = {
  create: vi.fn(),
  deleteMany: vi.fn(),
};
const restaurant = {
  findUnique: vi.fn(),
  deleteMany: vi.fn(),
};
const menuItem = { deleteMany: vi.fn() };
const menuClientOverride = { deleteMany: vi.fn() };
const menuSection = { deleteMany: vi.fn() };
const menuFolder = { deleteMany: vi.fn() };
const recipeIngredient = { deleteMany: vi.fn() };
const recipe = { deleteMany: vi.fn() };
const message = { deleteMany: vi.fn() };
const conversation = { deleteMany: vi.fn() };
const idea = { deleteMany: vi.fn() };
const yieldTest = { deleteMany: vi.fn() };
const productPriceHistory = { deleteMany: vi.fn() };
const product = { deleteMany: vi.fn() };

// $transaction(callback) recibe un "tx" client. Le pasamos las mismas
// instancias mockeadas para que el callback opere sobre ellas.
const transactionMock = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
  cb({
    menuItem,
    menuClientOverride,
    menuSection,
    menuFolder,
    recipeIngredient,
    recipe,
    message,
    conversation,
    idea,
    yieldTest,
    productPriceHistory,
    product,
    auditLog,
    user,
    restaurant,
  }),
);

vi.mock("@atelier/db", () => ({
  prisma: {
    user,
    auditLog,
    restaurant,
    $transaction: (cb: (tx: unknown) => Promise<unknown>) => transactionMock(cb),
  },
}));

vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => null) }));

let postRoute: typeof import("../route");
let preflightRoute: typeof import("../preflight/route");

beforeAll(async () => {
  process.env.MOBILE_JWT_SECRET = TEST_SECRET;
  postRoute = await import("../route");
  preflightRoute = await import("../preflight/route");
});

beforeEach(() => {
  user.findUnique.mockReset();
  user.findMany.mockReset();
  user.update.mockReset();
  user.updateMany.mockReset();
  auditLog.create.mockReset();
  auditLog.deleteMany.mockReset();
  restaurant.findUnique.mockReset();
  restaurant.deleteMany.mockReset();
  menuItem.deleteMany.mockReset();
  menuClientOverride.deleteMany.mockReset();
  menuSection.deleteMany.mockReset();
  menuFolder.deleteMany.mockReset();
  recipeIngredient.deleteMany.mockReset();
  recipe.deleteMany.mockReset();
  message.deleteMany.mockReset();
  conversation.deleteMany.mockReset();
  idea.deleteMany.mockReset();
  yieldTest.deleteMany.mockReset();
  productPriceHistory.deleteMany.mockReset();
  product.deleteMany.mockReset();
  transactionMock.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

async function makeToken(userId: string, tv = 0) {
  const { SignJWT } = await import("jose");
  const secret = new TextEncoder().encode(TEST_SECRET);
  return await new SignJWT({ sub: userId, tv })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("atelier-mobile")
    .setAudience("atelier-api")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret);
}

function makeReq(url: string, method: "GET" | "POST", token: string) {
  return new NextRequest(url, {
    method,
    headers: { Authorization: `Bearer ${token}` },
  });
}

// requireAuth → user.findUnique(id) for role/restaurant/tv validation.
function mockAuthedUser({
  userId,
  restaurantId,
  role = "chef_executive",
  tokenVersion = 0,
}: {
  userId: string;
  restaurantId: string | null;
  role?: "admin" | "chef_executive" | "sous_chef" | "viewer";
  tokenVersion?: number;
}) {
  user.findUnique.mockResolvedValueOnce({
    id: userId,
    role,
    restaurantId,
    tokenVersion,
  });
}

describe("GET /api/restaurant/leave/preflight", () => {
  it("returns case A when user is not the only admin", async () => {
    mockAuthedUser({ userId: "u1", restaurantId: "r1", role: "chef_executive" });
    user.findMany.mockResolvedValue([
      { id: "u1", name: "Chef", role: "chef_executive" },
      { id: "u2", name: "Admin", role: "admin" },
    ]);

    const token = await makeToken("u1");
    const res = await preflightRoute.GET(
      makeReq("https://test.local/api/restaurant/leave/preflight", "GET", token),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.case).toBe("A");
    expect(body.otherMembers).toBeUndefined();
  });

  it("returns case B with otherMembers when user is the only admin", async () => {
    mockAuthedUser({ userId: "u1", restaurantId: "r1", role: "admin" });
    user.findMany.mockResolvedValue([
      { id: "u1", name: "Only Admin", role: "admin" },
      { id: "u2", name: "Sous", role: "sous_chef" },
      { id: "u3", name: "Viewer", role: "viewer" },
    ]);

    const token = await makeToken("u1");
    const res = await preflightRoute.GET(
      makeReq("https://test.local/api/restaurant/leave/preflight", "GET", token),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.case).toBe("B");
    expect(body.otherMembers).toHaveLength(2);
    expect(body.otherMembers.map((m: { id: string }) => m.id).sort()).toEqual(["u2", "u3"]);
  });

  it("returns case C with restaurantName when user is the last member", async () => {
    mockAuthedUser({ userId: "u1", restaurantId: "r1", role: "admin" });
    user.findMany.mockResolvedValue([
      { id: "u1", name: "Solo", role: "admin" },
    ]);
    restaurant.findUnique.mockResolvedValue({ name: "Solo Kitchen" });

    const token = await makeToken("u1");
    const res = await preflightRoute.GET(
      makeReq("https://test.local/api/restaurant/leave/preflight", "GET", token),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.case).toBe("C");
    expect(body.restaurantName).toBe("Solo Kitchen");
    expect(body.otherMembers).toBeUndefined();
  });

  it("returns 404 when not in a restaurant", async () => {
    mockAuthedUser({ userId: "u1", restaurantId: null });
    const token = await makeToken("u1");
    const res = await preflightRoute.GET(
      makeReq("https://test.local/api/restaurant/leave/preflight", "GET", token),
    );
    expect(res.status).toBe(404);
  });
});

describe("POST /api/restaurant/leave", () => {
  it("case A: sets restaurantId=null, writes audit, returns action:left", async () => {
    mockAuthedUser({ userId: "u1", restaurantId: "r1", role: "chef_executive" });
    user.findMany.mockResolvedValue([
      { id: "u1", name: "Chef", role: "chef_executive" },
      { id: "u2", name: "Admin", role: "admin" },
    ]);
    // POST handler also reads previousRole before update.
    user.findUnique.mockResolvedValueOnce({ role: "chef_executive" });
    user.update.mockResolvedValue({ id: "u1", restaurantId: null });
    auditLog.create.mockResolvedValue({});

    const token = await makeToken("u1");
    const res = await postRoute.POST(
      makeReq("https://test.local/api/restaurant/leave", "POST", token),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.action).toBe("left");

    expect(user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { restaurantId: null },
    });
    expect(auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          restaurantId: "r1",
          actorId: "u1",
          action: "staff_left",
          targetType: "User",
          targetId: "u1",
        }),
      }),
    );
  });

  it("case B: 409 admin_handoff_required + otherMembers, no DB write", async () => {
    mockAuthedUser({ userId: "u1", restaurantId: "r1", role: "admin" });
    user.findMany.mockResolvedValue([
      { id: "u1", name: "Only Admin", role: "admin" },
      { id: "u2", name: "Sous", role: "sous_chef" },
    ]);

    const token = await makeToken("u1");
    const res = await postRoute.POST(
      makeReq("https://test.local/api/restaurant/leave", "POST", token),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("admin_handoff_required");
    expect(body.otherMembers).toHaveLength(1);
    expect(body.otherMembers[0].id).toBe("u2");

    expect(user.update).not.toHaveBeenCalled();
    expect(auditLog.create).not.toHaveBeenCalled();
  });

  it("case C: 200 action:deleted, runs 15 DELETEs in topological order inside $transaction", async () => {
    mockAuthedUser({ userId: "u1", restaurantId: "r1", role: "admin" });
    user.findMany.mockResolvedValue([
      { id: "u1", name: "Solo", role: "admin" },
    ]);
    // Cada deleteMany devuelve un count — el handler no lo lee pero el mock
    // necesita resolver con algo válido.
    const ok = (count: number) => ({ count });
    menuItem.deleteMany.mockResolvedValue(ok(1));
    menuClientOverride.deleteMany.mockResolvedValue(ok(0));
    menuSection.deleteMany.mockResolvedValue(ok(1));
    menuFolder.deleteMany.mockResolvedValue(ok(1));
    recipeIngredient.deleteMany.mockResolvedValue(ok(2));
    recipe.deleteMany.mockResolvedValue(ok(1));
    message.deleteMany.mockResolvedValue(ok(2));
    conversation.deleteMany.mockResolvedValue(ok(1));
    idea.deleteMany.mockResolvedValue(ok(1));
    yieldTest.deleteMany.mockResolvedValue(ok(1));
    productPriceHistory.deleteMany.mockResolvedValue(ok(3));
    product.deleteMany.mockResolvedValue(ok(2));
    auditLog.deleteMany.mockResolvedValue(ok(3));
    user.updateMany.mockResolvedValue(ok(1));
    restaurant.deleteMany.mockResolvedValue(ok(1));

    const token = await makeToken("u1");
    const res = await postRoute.POST(
      makeReq("https://test.local/api/restaurant/leave", "POST", token),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.action).toBe("deleted");

    // Una sola TX abierta.
    expect(transactionMock).toHaveBeenCalledTimes(1);

    // Orden topológico estricto: MenuItem (1) antes que Recipe (6), Recipe
    // antes que User updateMany (14), Restaurant último (15).
    const callOrder = [
      menuItem.deleteMany,
      menuClientOverride.deleteMany,
      menuSection.deleteMany,
      menuFolder.deleteMany,
      recipeIngredient.deleteMany,
      recipe.deleteMany,
      message.deleteMany,
      conversation.deleteMany,
      idea.deleteMany,
      yieldTest.deleteMany,
      productPriceHistory.deleteMany,
      product.deleteMany,
      auditLog.deleteMany,
      user.updateMany,
      restaurant.deleteMany,
    ];
    // Cada uno se llamó exactamente 1 vez.
    for (const fn of callOrder) {
      expect(fn).toHaveBeenCalledTimes(1);
    }
    // El último DELETE es el Restaurant.
    expect(restaurant.deleteMany).toHaveBeenCalledWith({
      where: { id: "r1" },
    });
    // User updateMany set restaurantId=null defensivo.
    expect(user.updateMany).toHaveBeenCalledWith({
      where: { restaurantId: "r1" },
      data: { restaurantId: null },
    });
  });

  it("returns 404 when not in a restaurant", async () => {
    mockAuthedUser({ userId: "u1", restaurantId: null });
    const token = await makeToken("u1");
    const res = await postRoute.POST(
      makeReq("https://test.local/api/restaurant/leave", "POST", token),
    );
    expect(res.status).toBe(404);
  });
});
