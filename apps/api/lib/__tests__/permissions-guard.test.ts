import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SignJWT } from "jose";
import { NextRequest } from "next/server";

const TEST_SECRET = "test-secret-do-not-use-in-prod-0123456789";

// Mock @atelier/db so we never touch a real DB.
const findUniqueMock = vi.fn();
vi.mock("@atelier/db", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => findUniqueMock(...args),
    },
  },
}));

// Mock @/lib/auth so requireAuth's session fallback never kicks in.
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(async () => null),
}));

// Resolve guard *after* mocks are in place.
let requireAuth: typeof import("../permissions-guard").requireAuth;

beforeAll(async () => {
  process.env.MOBILE_JWT_SECRET = TEST_SECRET;
  ({ requireAuth } = await import("../permissions-guard"));
});

beforeEach(() => {
  findUniqueMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

const secretKey = () => new TextEncoder().encode(TEST_SECRET);

async function makeToken(opts: {
  sub?: string;
  tv?: number;
  issuer?: string;
  audience?: string;
  secret?: Uint8Array;
  expSeconds?: number;
  iatSeconds?: number;
}) {
  const {
    sub = "user-1",
    tv = 1,
    issuer = "atelier-mobile",
    audience = "atelier-api",
    secret = secretKey(),
    expSeconds,
    iatSeconds,
  } = opts;

  const payload: Record<string, unknown> = { sub, tv };
  let jwt = new SignJWT(payload).setProtectedHeader({ alg: "HS256" });

  if (iatSeconds !== undefined) {
    jwt = jwt.setIssuedAt(iatSeconds);
  } else {
    jwt = jwt.setIssuedAt();
  }

  jwt = jwt.setIssuer(issuer).setAudience(audience);

  if (expSeconds !== undefined) {
    jwt = jwt.setExpirationTime(expSeconds);
  } else {
    jwt = jwt.setExpirationTime("30d");
  }

  return jwt.sign(secret);
}

function makeReq(headers: Record<string, string> = {}) {
  return new NextRequest("https://test.local/x", { headers });
}

describe("requireAuth (Bearer JWT path)", () => {
  it("rejects request without Authorization header", async () => {
    const res = await requireAuth(makeReq());
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(401);
  });

  it("rejects malformed Bearer token", async () => {
    const res = await requireAuth(makeReq({ Authorization: "Bearer not-a-jwt" }));
    expect((res as Response).status).toBe(401);
  });

  it("rejects token with invalid signature (signed with wrong secret)", async () => {
    const wrongSecret = new TextEncoder().encode("totally-different-secret-9876543210");
    const token = await makeToken({ secret: wrongSecret });
    const res = await requireAuth(makeReq({ Authorization: `Bearer ${token}` }));
    expect((res as Response).status).toBe(401);
  });

  it("rejects expired token", async () => {
    // iat 2 hours ago, exp 1 hour ago.
    const nowSec = Math.floor(Date.now() / 1000);
    const token = await makeToken({
      iatSeconds: nowSec - 7200,
      expSeconds: nowSec - 3600,
    });
    const res = await requireAuth(makeReq({ Authorization: `Bearer ${token}` }));
    expect((res as Response).status).toBe(401);
  });

  it("rejects token with wrong issuer", async () => {
    const token = await makeToken({ issuer: "malicious" });
    const res = await requireAuth(makeReq({ Authorization: `Bearer ${token}` }));
    expect((res as Response).status).toBe(401);
  });

  it("rejects token with wrong audience", async () => {
    const token = await makeToken({ audience: "not-our-api" });
    const res = await requireAuth(makeReq({ Authorization: `Bearer ${token}` }));
    expect((res as Response).status).toBe(401);
  });

  it("rejects token with stale tokenVersion (revoked)", async () => {
    findUniqueMock.mockResolvedValueOnce({
      id: "user-1",
      role: "chef_executive",
      restaurantId: "rest-1",
      tokenVersion: 5,
    });
    const token = await makeToken({ sub: "user-1", tv: 3 });
    const res = await requireAuth(makeReq({ Authorization: `Bearer ${token}` }));
    expect(res).toBeInstanceOf(Response);
    const r = res as Response;
    expect(r.status).toBe(401);
    expect(r.headers.get("WWW-Authenticate")).toContain('Bearer error="invalid_token"');
  });

  it("accepts valid token, attaches userId/role/restaurantId to ctx", async () => {
    findUniqueMock.mockResolvedValueOnce({
      id: "user-1",
      role: "chef_executive",
      restaurantId: "rest-1",
      tokenVersion: 1,
    });
    const token = await makeToken({ sub: "user-1", tv: 1 });
    const ctx = await requireAuth(makeReq({ Authorization: `Bearer ${token}` }));
    expect(ctx).toEqual({
      userId: "user-1",
      role: "chef_executive",
      restaurantId: "rest-1",
    });
  });

  it("accepts valid token without permission requirement (no restaurantId required)", async () => {
    findUniqueMock.mockResolvedValueOnce({
      id: "user-2",
      role: "viewer",
      restaurantId: null,
      tokenVersion: 0,
    });
    const token = await makeToken({ sub: "user-2", tv: 0 });
    const ctx = await requireAuth(makeReq({ Authorization: `Bearer ${token}` }));
    expect(ctx).toMatchObject({ userId: "user-2", role: "viewer" });
  });

  it("rejects valid token when user lacks permission (403)", async () => {
    findUniqueMock.mockResolvedValueOnce({
      id: "user-3",
      role: "viewer",
      restaurantId: "rest-1",
      tokenVersion: 1,
    });
    const token = await makeToken({ sub: "user-3", tv: 1 });
    // viewer cannot approve_recipe per permissions matrix.
    const res = await requireAuth(makeReq({ Authorization: `Bearer ${token}` }), "approve_recipe");
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(403);
  });

  it("accepts valid token with required permission", async () => {
    findUniqueMock.mockResolvedValueOnce({
      id: "user-4",
      role: "admin",
      restaurantId: "rest-1",
      tokenVersion: 2,
    });
    const token = await makeToken({ sub: "user-4", tv: 2 });
    const ctx = await requireAuth(makeReq({ Authorization: `Bearer ${token}` }), "manage_members");
    expect(ctx).toEqual({
      userId: "user-4",
      role: "admin",
      restaurantId: "rest-1",
    });
  });

  it("rejects when permission required but user has no restaurantId (403)", async () => {
    findUniqueMock.mockResolvedValueOnce({
      id: "user-5",
      role: "admin",
      restaurantId: null,
      tokenVersion: 0,
    });
    const token = await makeToken({ sub: "user-5", tv: 0 });
    const res = await requireAuth(makeReq({ Authorization: `Bearer ${token}` }), "manage_members");
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(403);
  });

  it("rejects when DB has no matching user (401)", async () => {
    findUniqueMock.mockResolvedValueOnce(null);
    const token = await makeToken({ sub: "ghost", tv: 0 });
    const res = await requireAuth(makeReq({ Authorization: `Bearer ${token}` }));
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(401);
  });
});
