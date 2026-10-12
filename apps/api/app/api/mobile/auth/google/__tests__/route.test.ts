import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Exercises the real route -> resolveOAuthIdentity -> createMobileSession chain.
// Only Google verification, the logger and the Prisma client are mocked, so the
// assertions cover what reaches the database and what the client receives.
const mocks = vi.hoisted(() => {
  const account = {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  };
  const user = { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() };
  const tx = { account, user };
  const transaction = vi.fn(
    async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  );
  return {
    account,
    user,
    tx,
    transaction,
    verifyGoogleIdToken: vi.fn(),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
});

vi.mock("@atelier/db", () => ({
  prisma: { $transaction: mocks.transaction },
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
vi.mock("@/lib/google-auth", () => ({ verifyGoogleIdToken: mocks.verifyGoogleIdToken }));
vi.mock("@/lib/logger", () => ({ logger: mocks.logger }));

import { POST } from "../route";

const { account, user, tx, transaction } = mocks;

const TEST_SECRET = "test-secret-do-not-use-in-prod-0123456789";

const googleProfile = {
  subject: "google-sub-123",
  email: "chef@example.com",
  name: "Chef Google",
  picture: null,
};

function storedUser(languagePref: string) {
  return {
    id: "user-1",
    email: "chef@example.com",
    name: "Chef Google",
    photoUrl: null,
    bio: null,
    role: "viewer",
    languagePref,
    defaultModel: "sonnet",
    restaurantId: null,
    tokenVersion: 0,
    restaurant: null,
  };
}

function request(body: unknown) {
  return new NextRequest("https://test.local/api/mobile/auth/google", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

type CreateArgs = { data: { languagePref?: unknown } };

function createdUserData() {
  const args = user.create.mock.calls[0]![0] as CreateArgs;
  return args.data;
}

async function responseLanguage(response: Response) {
  const json = (await response.json()) as { user: { languagePref: string } };
  return json.user.languagePref;
}

beforeAll(() => {
  process.env.MOBILE_JWT_SECRET = TEST_SECRET;
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyGoogleIdToken.mockResolvedValue(googleProfile);
  account.findUnique.mockResolvedValue(null);
  account.findFirst.mockResolvedValue(null);
  account.create.mockResolvedValue({});
  account.update.mockResolvedValue({});
  user.findUnique.mockResolvedValue(null);
  // Mirrors the database: an omitted languagePref falls back to the schema default.
  user.create.mockImplementation(async ({ data }: CreateArgs) =>
    storedUser(typeof data.languagePref === "string" ? data.languagePref : "es"),
  );
  transaction.mockImplementation(async (callback) => callback(tx));
});

describe("POST /api/mobile/auth/google — device language for new accounts", () => {
  it.each(["it", "en"] as const)(
    "creates a new account in the requested language (%s) and returns it",
    async (languagePref) => {
      const response = await POST(request({ idToken: "google-id-token", languagePref }));

      expect(response.status).toBe(200);
      expect(user.create).toHaveBeenCalledTimes(1);
      expect(createdUserData().languagePref).toBe(languagePref);
      expect(await responseLanguage(response)).toBe(languagePref);
    },
  );

  it("keeps the schema default when a legacy client sends no language", async () => {
    const response = await POST(request({ idToken: "google-id-token" }));

    expect(response.status).toBe(200);
    expect(createdUserData().languagePref).toBeUndefined();
    expect(await responseLanguage(response)).toBe("es");
  });

  it.each([["fr"], [123], [""], [null], [{ lang: "it" }]])(
    "ignores an invalid language hint (%j) and still signs in",
    async (languagePref) => {
      const response = await POST(request({ idToken: "google-id-token", languagePref }));

      expect(response.status).toBe(200);
      expect(createdUserData().languagePref).toBeUndefined();
      expect(await responseLanguage(response)).toBe("es");
    },
  );

  it("never changes the language of an account already linked to this Google identity", async () => {
    account.findUnique.mockResolvedValue({ id: "account-1", user: storedUser("es") });

    const response = await POST(request({ idToken: "google-id-token", languagePref: "it" }));

    expect(response.status).toBe(200);
    expect(user.create).not.toHaveBeenCalled();
    expect(user.update).not.toHaveBeenCalled();
    for (const [args] of account.update.mock.calls) {
      expect(JSON.stringify(args)).not.toContain("languagePref");
    }
    expect(await responseLanguage(response)).toBe("es");
  });

  it("never changes the language of an existing email account when linking Google", async () => {
    user.findUnique.mockResolvedValue(storedUser("en"));

    const response = await POST(request({ idToken: "google-id-token", languagePref: "it" }));

    expect(response.status).toBe(200);
    expect(user.create).not.toHaveBeenCalled();
    expect(user.update).not.toHaveBeenCalled();
    expect(account.create).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(account.create.mock.calls[0]![0])).not.toContain("languagePref");
    expect(await responseLanguage(response)).toBe("en");
  });
});
