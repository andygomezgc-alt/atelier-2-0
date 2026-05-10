import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const TEST_SECRET = "test-secret-do-not-use-in-prod-0123456789";

// --- Prisma mock ---
const idea = {
  findUnique: vi.fn(),
};
const conversation = {
  findUnique: vi.fn(),
  create: vi.fn(),
};
const user = {
  findUnique: vi.fn(),
};
const message = {
  findMany: vi.fn(),
};

vi.mock("@atelier/db", () => ({
  prisma: { idea, conversation, user, message },
}));

// requireAuth bypasses session lookup when MOBILE_JWT_SECRET is set and a
// valid bearer is presented. We mock auth() so the session fallback is null.
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => null) }));

let route: typeof import("../route");

beforeAll(async () => {
  process.env.MOBILE_JWT_SECRET = TEST_SECRET;
  route = await import("../route");
});

beforeEach(() => {
  idea.findUnique.mockReset();
  conversation.findUnique.mockReset();
  conversation.create.mockReset();
  user.findUnique.mockReset();
  message.findMany.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

// --- Helpers ---

async function makeToken(userId: string, tv = 1) {
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

function makeReq(url: string, token: string) {
  return new NextRequest(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
}

// requireAuth performs prisma.user.findUnique to validate role/restaurant/tv,
// then the route does another lookup for defaultModel. Queue both responses.
function mockAuthedUser({
  userId,
  restaurantId,
  role = "chef_executive",
  tokenVersion = 1,
}: {
  userId: string;
  restaurantId: string | null;
  role?: string;
  tokenVersion?: number;
}) {
  // 1) requireAuth's user lookup
  user.findUnique.mockResolvedValueOnce({ id: userId, role, restaurantId, tokenVersion });
  // 2) route's defaultModel lookup
  user.findUnique.mockResolvedValueOnce({ defaultModel: "sonnet" });
}

describe("GET /api/ideas/:id/conversation", () => {
  it("returns 404 when idea does not exist", async () => {
    mockAuthedUser({ userId: "u1", restaurantId: "r1" });
    idea.findUnique.mockResolvedValue(null);

    const token = await makeToken("u1");
    const res = await route.GET(
      makeReq("https://test.local/api/ideas/missing/conversation", token),
      { params: Promise.resolve({ id: "missing" }) },
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when idea belongs to another restaurant (IDOR guard)", async () => {
    mockAuthedUser({ userId: "u1", restaurantId: "r1" });
    idea.findUnique.mockResolvedValue({ id: "idea-X", restaurantId: "r2" });

    const token = await makeToken("u1");
    const res = await route.GET(
      makeReq("https://test.local/api/ideas/idea-X/conversation", token),
      { params: Promise.resolve({ id: "idea-X" }) },
    );
    expect(res.status).toBe(404);
    expect(conversation.findUnique).not.toHaveBeenCalled();
  });

  it("creates a conversation on first open and returns empty messages", async () => {
    mockAuthedUser({ userId: "u1", restaurantId: "r1" });
    idea.findUnique.mockResolvedValue({ id: "idea-A", restaurantId: "r1" });
    conversation.findUnique.mockResolvedValue(null);
    conversation.create.mockResolvedValue({
      id: "conv-A",
      modelUsed: "sonnet",
      createdAt: new Date("2026-05-10T00:00:00Z"),
      messages: [],
    });

    const token = await makeToken("u1");
    const res = await route.GET(
      makeReq("https://test.local/api/ideas/idea-A/conversation", token),
      { params: Promise.resolve({ id: "idea-A" }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      id: "conv-A",
      modelUsed: "sonnet",
      createdAt: "2026-05-10T00:00:00.000Z",
      messages: [],
    });
    expect(conversation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ideaId: "idea-A", restaurantId: "r1", authorId: "u1" }),
      }),
    );
  });

  it("returns ONLY messages of the requested idea (isolation between ideas)", async () => {
    mockAuthedUser({ userId: "u1", restaurantId: "r1" });
    idea.findUnique.mockResolvedValue({ id: "idea-A", restaurantId: "r1" });
    conversation.findUnique.mockResolvedValue({
      id: "conv-A",
      modelUsed: "sonnet",
      createdAt: new Date("2026-05-10T00:00:00Z"),
      messages: [
        { id: "m1", role: "user", content: "Pichón con espuma de café", createdAt: new Date("2026-05-10T00:01:00Z") },
        { id: "m2", role: "assistant", content: "Excelente combinación", createdAt: new Date("2026-05-10T00:01:30Z") },
      ],
    });

    const token = await makeToken("u1");
    const res = await route.GET(
      makeReq("https://test.local/api/ideas/idea-A/conversation", token),
      { params: Promise.resolve({ id: "idea-A" }) },
    );
    const body = await res.json();
    expect(body.id).toBe("conv-A");
    expect(body.messages.map((m: { id: string }) => m.id)).toEqual(["m1", "m2"]);

    // Prisma was queried with ideaId=idea-A — never could leak from another idea.
    expect(conversation.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ideaId: "idea-A" } }),
    );
    expect(conversation.create).not.toHaveBeenCalled();
  });

  it("returns existing conversation on subsequent opens (1:1 idea→conversation)", async () => {
    mockAuthedUser({ userId: "u1", restaurantId: "r1" });
    idea.findUnique.mockResolvedValue({ id: "idea-A", restaurantId: "r1" });
    conversation.findUnique.mockResolvedValue({
      id: "conv-A",
      modelUsed: "sonnet",
      createdAt: new Date("2026-05-10T00:00:00Z"),
      messages: [{ id: "m1", role: "user", content: "hola", createdAt: new Date() }],
    });

    const token = await makeToken("u1");
    const res = await route.GET(
      makeReq("https://test.local/api/ideas/idea-A/conversation", token),
      { params: Promise.resolve({ id: "idea-A" }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("conv-A");
    expect(conversation.create).not.toHaveBeenCalled();
  });

  it("isolates conversations across ideas: idea B never returns idea A messages", async () => {
    // Simulates two sequential calls: first open idea A, then open idea B.
    // The DB returns each idea's own conversation; the route MUST query by
    // the requested ideaId only, so messages from A cannot bleed into B.

    // --- Call 1: idea A ---
    mockAuthedUser({ userId: "u1", restaurantId: "r1" });
    idea.findUnique.mockResolvedValueOnce({ id: "idea-A", restaurantId: "r1" });
    conversation.findUnique.mockResolvedValueOnce({
      id: "conv-A",
      modelUsed: "sonnet",
      createdAt: new Date("2026-05-10T00:00:00Z"),
      messages: [{ id: "mA1", role: "user", content: "Pichón", createdAt: new Date() }],
    });

    let token = await makeToken("u1");
    let res = await route.GET(
      makeReq("https://test.local/api/ideas/idea-A/conversation", token),
      { params: Promise.resolve({ id: "idea-A" }) },
    );
    let body = await res.json();
    expect(body.id).toBe("conv-A");
    expect(body.messages.map((m: { id: string }) => m.id)).toEqual(["mA1"]);

    // --- Call 2: idea B ---
    mockAuthedUser({ userId: "u1", restaurantId: "r1" });
    idea.findUnique.mockResolvedValueOnce({ id: "idea-B", restaurantId: "r1" });
    conversation.findUnique.mockResolvedValueOnce({
      id: "conv-B",
      modelUsed: "sonnet",
      createdAt: new Date("2026-05-10T00:00:00Z"),
      messages: [{ id: "mB1", role: "user", content: "Tartar", createdAt: new Date() }],
    });

    token = await makeToken("u1");
    res = await route.GET(
      makeReq("https://test.local/api/ideas/idea-B/conversation", token),
      { params: Promise.resolve({ id: "idea-B" }) },
    );
    body = await res.json();
    expect(body.id).toBe("conv-B");
    expect(body.messages.map((m: { id: string }) => m.id)).toEqual(["mB1"]);
    // No A-messages leaked.
    expect(body.messages.find((m: { id: string }) => m.id === "mA1")).toBeUndefined();
  });
});
