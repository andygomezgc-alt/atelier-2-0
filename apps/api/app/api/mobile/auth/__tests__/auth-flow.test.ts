import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { createHash } from "node:crypto";

const TEST_SECRET = "test-secret-do-not-use-in-prod-0123456789";

// --- Prisma mock ---
const verificationToken = {
  findUnique: vi.fn(),
  upsert: vi.fn(),
  delete: vi.fn(),
  create: vi.fn(),
};
const user = {
  findUnique: vi.fn(),
  upsert: vi.fn(),
};

vi.mock("@atelier/db", () => ({
  prisma: { verificationToken, user },
}));

// --- Resend mock (avoid network) ---
const sendMock = vi.fn(async () => ({ id: "email-id" }));
vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: sendMock },
  })),
}));

let requestRoute: typeof import("../request/route");
let verifyRoute: typeof import("../verify/route");

beforeAll(async () => {
  process.env.MOBILE_JWT_SECRET = TEST_SECRET;
  process.env.RESEND_API_KEY = "re_test_dummy";
  // Imports after env+mocks so module-scope reads see them.
  requestRoute = await import("../request/route");
  verifyRoute = await import("../verify/route");
});

beforeEach(() => {
  verificationToken.findUnique.mockReset();
  verificationToken.upsert.mockReset();
  verificationToken.delete.mockReset();
  verificationToken.create.mockReset();
  user.findUnique.mockReset();
  user.upsert.mockReset();
  sendMock.mockClear();
  // Default: upsert succeeds, returns nothing useful.
  verificationToken.upsert.mockResolvedValue({});
});

afterEach(() => {
  vi.clearAllMocks();
});

const sha256 = (t: string) => createHash("sha256").update(t).digest("hex");

function makePost(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/mobile/auth/request (magic link)", () => {
  it("returns 200 even when email shape is valid (anti-enumeration: same response regardless of user existence)", async () => {
    const ip = "203.0.113.10";
    const res = await requestRoute.POST(
      makePost("https://test.local/api/mobile/auth/request", { email: "new@example.com" }, {
        "x-forwarded-for": ip,
      }),
    );
    expect(res.status).toBe(200);
    expect(verificationToken.upsert).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledTimes(1);

    // Token persisted hashed, not in plaintext.
    const arg = verificationToken.upsert.mock.calls[0]![0];
    const stored = arg.create.token as string;
    expect(stored).toMatch(/^[a-f0-9]{64}$/); // sha256 hex
  });

  it("returns 400 on invalid email", async () => {
    const res = await requestRoute.POST(
      makePost("https://test.local/api/mobile/auth/request", { email: "not-an-email" }),
    );
    expect(res.status).toBe(400);
  });

  it("rate-limits a second immediate request for same email (in-memory limiter)", async () => {
    // First call from a *fresh* email + ip primes the limiter.
    const email = `ratelimit-${Date.now()}@example.com`;
    const ip = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
    const r1 = await requestRoute.POST(
      makePost("https://test.local/api/mobile/auth/request", { email }, { "x-forwarded-for": ip }),
    );
    expect(r1.status).toBe(200);

    // Second call within window for same email -> 429.
    const r2 = await requestRoute.POST(
      makePost("https://test.local/api/mobile/auth/request", { email }, { "x-forwarded-for": ip }),
    );
    expect(r2.status).toBe(429);
    expect(r2.headers.get("Retry-After")).toBeTruthy();
  });
});

describe("POST /api/mobile/auth/verify", () => {
  it("returns 401 if token does not exist in DB", async () => {
    verificationToken.findUnique.mockResolvedValueOnce(null);
    const res = await verifyRoute.POST(
      makePost("https://test.local/api/mobile/auth/verify", {
        email: "user@example.com",
        token: "deadbeef",
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 if token or email missing", async () => {
    const res = await verifyRoute.POST(
      makePost("https://test.local/api/mobile/auth/verify", { email: "user@example.com" }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 401 if token expired and deletes the stale row", async () => {
    verificationToken.findUnique.mockResolvedValueOnce({
      identifier: "user@example.com",
      token: "stored-hash",
      expires: new Date(Date.now() - 1000),
    });
    verificationToken.delete.mockResolvedValueOnce({});
    const res = await verifyRoute.POST(
      makePost("https://test.local/api/mobile/auth/verify", {
        email: "user@example.com",
        token: "expired-token",
      }),
    );
    expect(res.status).toBe(401);
    expect(verificationToken.delete).toHaveBeenCalled();
  });

  it("hashes the incoming token before DB lookup (no plaintext in where-clause)", async () => {
    verificationToken.findUnique.mockResolvedValueOnce(null);
    const plainToken = "plain-text-token-abcdef";
    await verifyRoute.POST(
      makePost("https://test.local/api/mobile/auth/verify", {
        email: "user@example.com",
        token: plainToken,
      }),
    );
    expect(verificationToken.findUnique).toHaveBeenCalledTimes(1);
    const arg = verificationToken.findUnique.mock.calls[0]![0];
    const tokenInWhere = arg.where.identifier_token.token as string;
    expect(tokenInWhere).toBe(sha256(plainToken));
    expect(tokenInWhere).not.toBe(plainToken);
  });

  it("returns JWT with iss=atelier-mobile, aud=atelier-api, tv=user.tokenVersion when OK", async () => {
    const email = "ok@example.com";
    const plainToken = "good-token-1234";
    const expires = new Date(Date.now() + 5 * 60 * 1000);
    verificationToken.findUnique.mockResolvedValueOnce({
      identifier: email,
      token: sha256(plainToken),
      expires,
    });
    verificationToken.delete.mockResolvedValueOnce({});
    user.upsert.mockResolvedValueOnce({
      id: "user-42",
      email,
      name: "ok",
      role: "chef_executive",
      restaurantId: "rest-1",
      languagePref: "es",
      defaultModel: "sonnet",
      tokenVersion: 7,
      restaurant: { name: "Atelier Test" },
    });

    const res = await verifyRoute.POST(
      makePost("https://test.local/api/mobile/auth/verify", { email, token: plainToken }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { accessToken: string; user: { id: string } };
    expect(json.accessToken).toBeTruthy();
    expect(json.user.id).toBe("user-42");

    const { payload } = await jwtVerify(
      json.accessToken,
      new TextEncoder().encode(TEST_SECRET),
      { issuer: "atelier-mobile", audience: "atelier-api" },
    );
    expect(payload.sub).toBe("user-42");
    expect(payload.tv).toBe(7);
  });
});
