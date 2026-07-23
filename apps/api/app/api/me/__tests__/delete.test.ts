import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const TEST_SECRET = "test-secret-do-not-use-in-prod-0123456789";

const user = {
  findUnique: vi.fn(),
  findMany: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  delete: vi.fn(),
};
const restaurant = { findUnique: vi.fn(), deleteMany: vi.fn() };
const account = { deleteMany: vi.fn() };
const session = { deleteMany: vi.fn() };
const aiUsage = { deleteMany: vi.fn() };
const verificationToken = { deleteMany: vi.fn() };
const auditLog = { create: vi.fn(), deleteMany: vi.fn() };
const menuItem = { deleteMany: vi.fn() };
const menuClientOverride = { deleteMany: vi.fn() };
const menuSection = { deleteMany: vi.fn() };
const menuFolder = { deleteMany: vi.fn() };
const recipeIngredient = { deleteMany: vi.fn() };
const recipe = { deleteMany: vi.fn(), count: vi.fn() };
const message = { deleteMany: vi.fn() };
const conversation = { deleteMany: vi.fn(), count: vi.fn() };
const idea = { deleteMany: vi.fn(), count: vi.fn() };
const yieldTest = { deleteMany: vi.fn(), count: vi.fn() };
const productPriceHistory = { deleteMany: vi.fn() };
const product = { deleteMany: vi.fn() };
const deleteBlobs = vi.fn();
const revokeAppleRefreshToken = vi.fn();
const decryptAppleToken = vi.fn((value: string) => `plain:${value}`);
const stripeMocks = vi.hoisted(() => ({
  retrieve: vi.fn(),
  cancel: vi.fn(),
}));

const tx = {
  user,
  restaurant,
  account,
  session,
  aiUsage,
  verificationToken,
  auditLog,
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
};

const transactionMock = vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) =>
  callback(tx),
);

vi.mock("@atelier/db", () => ({
  prisma: {
    ...tx,
    $transaction: (callback: (client: typeof tx) => Promise<unknown>) =>
      transactionMock(callback),
  },
  Prisma: {
    TransactionIsolationLevel: { Serializable: "Serializable" },
    PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {
      code: string;

      constructor(message: string, { code }: { code: string }) {
        super(message);
        this.code = code;
      }
    },
  },
}));

vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => null) }));
vi.mock("@/lib/blob", () => ({ deleteBlobs }));
vi.mock("@/lib/apple-auth", () => ({ revokeAppleRefreshToken }));
vi.mock("@/lib/apple-token-crypto", () => ({ decryptAppleToken }));
vi.mock("stripe", () => ({
  default: class Stripe {
    subscriptions = stripeMocks;
  },
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

let meRoute: typeof import("../route");
let preflightRoute: typeof import("../delete-preflight/route");

beforeAll(async () => {
  process.env.MOBILE_JWT_SECRET = TEST_SECRET;
  meRoute = await import("../route");
  preflightRoute = await import("../delete-preflight/route");
});

beforeEach(() => {
  for (const model of Object.values(tx)) {
    for (const fn of Object.values(model)) {
      if (typeof fn === "function" && "mockReset" in fn) {
        (fn as ReturnType<typeof vi.fn>).mockReset();
      }
    }
  }
  deleteBlobs.mockReset();
  deleteBlobs.mockResolvedValue(undefined);
  revokeAppleRefreshToken.mockReset();
  revokeAppleRefreshToken.mockResolvedValue(undefined);
  decryptAppleToken.mockClear();
  stripeMocks.retrieve.mockReset();
  stripeMocks.retrieve.mockResolvedValue({ status: "active" });
  stripeMocks.cancel.mockReset();
  stripeMocks.cancel.mockResolvedValue({ status: "canceled" });
  transactionMock.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

async function makeToken(userId: string, tv = 0) {
  const { SignJWT } = await import("jose");
  return new SignJWT({ sub: userId, tv })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("atelier-mobile")
    .setAudience("atelier-api")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(TEST_SECRET));
}

function makeReq(path: string, method: "GET" | "DELETE", token: string, body?: unknown) {
  return new NextRequest(`https://test.local${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function mockAuth(restaurantId: string | null, role = "admin") {
  user.findUnique.mockResolvedValueOnce({
    id: "u1",
    role,
    restaurantId,
    tokenVersion: 0,
  });
}

function mockOriginal(
  restaurantId: string | null,
  photoUrl: string | null = null,
  appleRefreshTokens: string[] = [],
) {
  user.findUnique.mockResolvedValueOnce({
    email: "chef@example.com",
    photoUrl,
    restaurantId,
    accounts: appleRefreshTokens.map((refresh_token) => ({ refresh_token })),
  });
}

function mockTxUser(restaurantId: string | null, role = "admin") {
  user.findUnique.mockResolvedValueOnce({
    id: "u1",
    email: "chef@example.com",
    role,
    restaurantId,
  });
}

const membersA = [
  { id: "u1", name: "Chef", role: "sous_chef" },
  { id: "u2", name: "Admin", role: "admin" },
];
const membersB = [
  { id: "u1", name: "Admin", role: "admin" },
  { id: "u2", name: "Sous", role: "sous_chef" },
];
const membersC = [{ id: "u1", name: "Solo", role: "admin" }];

describe("GET /api/me/delete-preflight", () => {
  it("returns case B, restaurant, members and authored counts", async () => {
    mockAuth("r1");
    user.findMany.mockResolvedValue(membersB);
    restaurant.findUnique.mockResolvedValue({ name: "Atelier" });
    recipe.count.mockResolvedValue(2);
    idea.count.mockResolvedValue(3);
    conversation.count.mockResolvedValue(4);
    yieldTest.count.mockResolvedValue(5);

    const token = await makeToken("u1");
    const res = await preflightRoute.GET(
      makeReq("/api/me/delete-preflight", "GET", token),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      case: "B",
      restaurantName: "Atelier",
      otherMembers: [{ id: "u2", name: "Sous", role: "sous_chef" }],
      authored: { recipes: 2, ideas: 3, conversations: 4, yieldTests: 5 },
    });
  });

  it("returns none and authored counts without restaurant lookup", async () => {
    mockAuth(null, "viewer");
    recipe.count.mockResolvedValue(0);
    idea.count.mockResolvedValue(0);
    conversation.count.mockResolvedValue(0);
    yieldTest.count.mockResolvedValue(0);

    const token = await makeToken("u1");
    const res = await preflightRoute.GET(
      makeReq("/api/me/delete-preflight", "GET", token),
    );

    expect(await res.json()).toEqual({
      case: "none",
      restaurantName: null,
      authored: { recipes: 0, ideas: 0, conversations: 0, yieldTests: 0 },
    });
    expect(restaurant.findUnique).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/me", () => {
  it("returns 400 confirm_mismatch when the email is not exact", async () => {
    mockAuth("r1");
    mockOriginal("r1");

    const token = await makeToken("u1");
    const res = await meRoute.DELETE(
      makeReq("/api/me", "DELETE", token, { confirmEmail: "Chef@example.com" }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "confirm_mismatch" });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("case B returns 409 last_admin without deleting anything", async () => {
    mockAuth("r1");
    mockOriginal("r1");
    mockTxUser("r1");
    user.findMany.mockResolvedValue(membersB);

    const token = await makeToken("u1");
    const res = await meRoute.DELETE(
      makeReq("/api/me", "DELETE", token, { confirmEmail: "chef@example.com" }),
    );

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "last_admin" });
    expect(user.update).not.toHaveBeenCalled();
    expect(user.delete).not.toHaveBeenCalled();
    expect(verificationToken.deleteMany).not.toHaveBeenCalled();
    expect(revokeAppleRefreshToken).not.toHaveBeenCalled();
  });

  it("case A anonymizes the user and leaves restaurant content intact", async () => {
    mockAuth("r1", "sous_chef");
    mockOriginal("r1", "https://assets.blob.vercel-storage.com/avatar.jpg");
    mockTxUser("r1", "sous_chef");
    user.findMany.mockResolvedValue(membersA);
    auditLog.create.mockResolvedValue({});

    const token = await makeToken("u1");
    const res = await meRoute.DELETE(
      makeReq("/api/me", "DELETE", token, { confirmEmail: "chef@example.com" }),
    );

    expect(res.status).toBe(204);
    expect(user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: {
        email: "deleted-u1@deleted.atelier.invalid",
        name: "—",
        photoUrl: null,
        bio: null,
        restaurantId: null,
        role: "viewer",
        tokenVersion: { increment: 1 },
      },
    });
    expect(account.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
    expect(session.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
    expect(aiUsage.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
    expect(auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "account_deleted", restaurantId: "r1" }),
    });
    expect(restaurant.deleteMany).not.toHaveBeenCalled();
    expect(recipe.deleteMany).not.toHaveBeenCalled();
    expect(verificationToken.deleteMany).toHaveBeenCalledWith({
      where: { identifier: "chef@example.com" },
    });
    expect(deleteBlobs).toHaveBeenCalledWith([
      "https://assets.blob.vercel-storage.com/avatar.jpg",
      undefined,
      undefined,
    ]);
  });

  it("case C deletes the restaurant pipeline and then the user", async () => {
    mockAuth("r1");
    mockOriginal("r1");
    mockTxUser("r1");
    user.findMany.mockResolvedValue(membersC);
    restaurant.findUnique.mockResolvedValue({
      stripeSubscriptionId: null,
      photoUrl: null,
      menuStyleRefUrl: null,
    });
    // Sin autoría remanente en otros restaurantes → borrado real de la fila.
    recipe.count.mockResolvedValue(0);
    idea.count.mockResolvedValue(0);
    conversation.count.mockResolvedValue(0);
    yieldTest.count.mockResolvedValue(0);

    const token = await makeToken("u1");
    const res = await meRoute.DELETE(
      makeReq("/api/me", "DELETE", token, { confirmEmail: "chef@example.com" }),
    );

    expect(res.status).toBe(204);
    const pipeline = [
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
    ];
    for (const model of pipeline) expect(model.deleteMany).toHaveBeenCalledTimes(1);
    expect(user.updateMany).toHaveBeenCalledWith({
      where: { restaurantId: "r1" },
      data: { restaurantId: null },
    });
    expect(restaurant.deleteMany).toHaveBeenCalledWith({ where: { id: "r1" } });
    expect(user.delete).toHaveBeenCalledWith({ where: { id: "u1" } });
    expect(verificationToken.deleteMany).toHaveBeenCalledWith({
      where: { identifier: "chef@example.com" },
    });
  });

  it("case C anonymizes instead of deleting when authorship survives elsewhere", async () => {
    // Chef que dejó recetas en un restaurante anterior (leave caso A) y ahora
    // borra su cuenta siendo último miembro de otro: user.delete lanzaría
    // P2003 por los FK Restrict — el guard debe anonimizar en su lugar.
    mockAuth("r1");
    mockOriginal("r1");
    mockTxUser("r1");
    user.findMany.mockResolvedValue(membersC);
    restaurant.findUnique.mockResolvedValue({
      stripeSubscriptionId: null,
      photoUrl: null,
      menuStyleRefUrl: null,
    });
    recipe.count.mockResolvedValue(3);
    idea.count.mockResolvedValue(0);
    conversation.count.mockResolvedValue(0);
    yieldTest.count.mockResolvedValue(0);

    const token = await makeToken("u1");
    const res = await meRoute.DELETE(
      makeReq("/api/me", "DELETE", token, { confirmEmail: "chef@example.com" }),
    );

    expect(res.status).toBe(204);
    expect(restaurant.deleteMany).toHaveBeenCalledWith({ where: { id: "r1" } });
    expect(user.delete).not.toHaveBeenCalled();
    expect(user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: expect.objectContaining({
        email: "deleted-u1@deleted.atelier.invalid",
        tokenVersion: { increment: 1 },
      }),
    });
    // Sin restaurante vivo no hay dónde auditar (el suyo acaba de borrarse).
    expect(auditLog.create).not.toHaveBeenCalled();
  });

  it("case none anonymizes when the user still has authored rows", async () => {
    mockAuth(null, "viewer");
    mockOriginal(null);
    mockTxUser(null, "viewer");
    recipe.count.mockResolvedValue(0);
    idea.count.mockResolvedValue(2);
    conversation.count.mockResolvedValue(0);
    yieldTest.count.mockResolvedValue(0);

    const token = await makeToken("u1");
    const res = await meRoute.DELETE(
      makeReq("/api/me", "DELETE", token, { confirmEmail: "chef@example.com" }),
    );

    expect(res.status).toBe(204);
    expect(user.delete).not.toHaveBeenCalled();
    expect(user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: expect.objectContaining({ email: "deleted-u1@deleted.atelier.invalid" }),
    });
    expect(account.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
    expect(auditLog.create).not.toHaveBeenCalled();
  });

  it("case none deletes the user directly when there is no authored content", async () => {
    mockAuth(null, "viewer");
    mockOriginal(null);
    mockTxUser(null, "viewer");
    recipe.count.mockResolvedValue(0);
    idea.count.mockResolvedValue(0);
    conversation.count.mockResolvedValue(0);
    yieldTest.count.mockResolvedValue(0);

    const token = await makeToken("u1");
    const res = await meRoute.DELETE(
      makeReq("/api/me", "DELETE", token, { confirmEmail: "chef@example.com" }),
    );

    expect(res.status).toBe(204);
    expect(user.delete).toHaveBeenCalledWith({ where: { id: "u1" } });
    expect(user.update).not.toHaveBeenCalled();
    expect(account.deleteMany).not.toHaveBeenCalled();
    expect(verificationToken.deleteMany).toHaveBeenCalledWith({
      where: { identifier: "chef@example.com" },
    });
  });

  it("revokes the Apple refresh token before deleting the account", async () => {
    mockAuth(null, "viewer");
    mockOriginal(null, null, ["encrypted-refresh-token"]);
    mockTxUser(null, "viewer");
    recipe.count.mockResolvedValue(0);
    idea.count.mockResolvedValue(0);
    conversation.count.mockResolvedValue(0);
    yieldTest.count.mockResolvedValue(0);

    const token = await makeToken("u1");
    const res = await meRoute.DELETE(
      makeReq("/api/me", "DELETE", token, { confirmEmail: "chef@example.com" }),
    );

    expect(res.status).toBe(204);
    expect(decryptAppleToken).toHaveBeenCalledWith("encrypted-refresh-token");
    expect(revokeAppleRefreshToken).toHaveBeenCalledWith(
      "plain:encrypted-refresh-token",
    );
    expect(user.delete).toHaveBeenCalledWith({ where: { id: "u1" } });
  });

  it("does not delete anything when Apple token revocation fails", async () => {
    mockAuth(null, "viewer");
    mockOriginal(null, null, ["encrypted-refresh-token"]);
    revokeAppleRefreshToken.mockRejectedValueOnce(new Error("apple_unavailable"));

    const token = await makeToken("u1");
    const res = await meRoute.DELETE(
      makeReq("/api/me", "DELETE", token, { confirmEmail: "chef@example.com" }),
    );

    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ code: "apple_revoke_failed" });
    expect(transactionMock).not.toHaveBeenCalled();
    expect(user.delete).not.toHaveBeenCalled();
    expect(user.update).not.toHaveBeenCalled();
  });

  it("reports partial Stripe cancellation when Apple revocation then fails", async () => {
    mockAuth("r1");
    mockOriginal("r1", null, ["encrypted-refresh-token"]);
    user.findMany.mockResolvedValue(membersC);
    restaurant.findUnique.mockResolvedValue({
      stripeSubscriptionId: "sub_123",
      photoUrl: null,
      menuStyleRefUrl: null,
    });
    revokeAppleRefreshToken.mockRejectedValueOnce(new Error("apple_unavailable"));

    const token = await makeToken("u1");
    const res = await meRoute.DELETE(
      makeReq("/api/me", "DELETE", token, { confirmEmail: "chef@example.com" }),
    );

    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({
      code: "apple_revoke_failed_after_stripe",
    });
    expect(stripeMocks.cancel).toHaveBeenCalledWith(
      "sub_123",
      {},
      { idempotencyKey: "delete-account:u1:sub_123" },
    );
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("treats an already canceled Stripe subscription as an idempotent retry", async () => {
    mockAuth("r1");
    mockOriginal("r1");
    mockTxUser("r1");
    user.findMany.mockResolvedValue(membersC);
    restaurant.findUnique.mockResolvedValue({
      stripeSubscriptionId: "sub_123",
      photoUrl: null,
      menuStyleRefUrl: null,
    });
    stripeMocks.retrieve.mockResolvedValueOnce({ status: "canceled" });
    recipe.count.mockResolvedValue(0);
    idea.count.mockResolvedValue(0);
    conversation.count.mockResolvedValue(0);
    yieldTest.count.mockResolvedValue(0);

    const token = await makeToken("u1");
    const res = await meRoute.DELETE(
      makeReq("/api/me", "DELETE", token, { confirmEmail: "chef@example.com" }),
    );

    expect(res.status).toBe(204);
    expect(stripeMocks.retrieve).toHaveBeenCalledWith("sub_123");
    expect(stripeMocks.cancel).not.toHaveBeenCalled();
    expect(user.delete).toHaveBeenCalledWith({ where: { id: "u1" } });
  });

  it("returns 409 case_changed when the transaction recompute differs", async () => {
    mockAuth("r1", "sous_chef");
    mockOriginal("r1");
    mockTxUser("r1", "sous_chef");
    user.findMany.mockResolvedValueOnce(membersA).mockResolvedValueOnce(membersC);

    const token = await makeToken("u1");
    const res = await meRoute.DELETE(
      makeReq("/api/me", "DELETE", token, { confirmEmail: "chef@example.com" }),
    );

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "case_changed" });
    expect(user.update).not.toHaveBeenCalled();
    expect(user.delete).not.toHaveBeenCalled();
    expect(verificationToken.deleteMany).not.toHaveBeenCalled();
  });
});
