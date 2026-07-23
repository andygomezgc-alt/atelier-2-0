import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const account = {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  };
  const user = { findUnique: vi.fn(), create: vi.fn() };
  const tx = { account, user };
  const transaction = vi.fn(
    async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  );
  return { account, user, tx, transaction };
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

import { OAuthIdentityError, resolveOAuthIdentity } from "../oauth-identity";

const { account, user, tx, transaction } = mocks;

const existingUser = {
  id: "user-1",
  email: "chef@example.com",
  name: "Chef",
  photoUrl: null,
  bio: null,
  role: "viewer",
  languagePref: "es",
  defaultModel: "sonnet",
  restaurantId: null,
  tokenVersion: 0,
  restaurant: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  account.findUnique.mockResolvedValue(null);
  account.findFirst.mockResolvedValue(null);
  account.create.mockResolvedValue({});
  account.update.mockResolvedValue({});
  user.findUnique.mockResolvedValue(null);
  user.create.mockResolvedValue(existingUser);
  transaction.mockImplementation(async (callback) => callback(tx));
});

describe("resolveOAuthIdentity", () => {
  it("uses provider + subject before email and refreshes stored tokens", async () => {
    account.findUnique.mockResolvedValue({ id: "account-1", user: existingUser });

    const resolved = await resolveOAuthIdentity({
      provider: "apple",
      providerAccountId: "stable-apple-sub",
      email: "changed@example.com",
      name: null,
      tokens: { refreshToken: "encrypted-token" },
    });

    expect(resolved).toBe(existingUser);
    expect(user.findUnique).not.toHaveBeenCalled();
    expect(account.update).toHaveBeenCalledWith({
      where: { id: "account-1" },
      data: { refresh_token: "encrypted-token" },
    });
  });

  it("links a verified exact-email match without replacing the user", async () => {
    user.findUnique.mockResolvedValue(existingUser);

    const resolved = await resolveOAuthIdentity({
      provider: "apple",
      providerAccountId: "stable-apple-sub",
      email: "chef@example.com",
      name: "Different Name",
    });

    expect(resolved).toBe(existingUser);
    expect(account.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        provider: "apple",
        providerAccountId: "stable-apple-sub",
      }),
    });
    expect(user.create).not.toHaveBeenCalled();
  });

  it("creates user and identity together for a new verified email", async () => {
    await resolveOAuthIdentity({
      provider: "google",
      providerAccountId: "stable-google-sub",
      email: "new@example.com",
      name: "New Chef",
      photoUrl: "https://example.com/photo.jpg",
    });

    expect(user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: "new@example.com",
        name: "New Chef",
        accounts: {
          create: expect.objectContaining({
            provider: "google",
            providerAccountId: "stable-google-sub",
          }),
        },
      }),
      select: expect.any(Object),
    });
  });

  it("does not create an unlinked account when Apple omits email", async () => {
    await expect(
      resolveOAuthIdentity({
        provider: "apple",
        providerAccountId: "unknown-apple-sub",
        email: null,
        name: null,
      }),
    ).rejects.toEqual(new OAuthIdentityError("oauth_email_missing"));
    expect(user.create).not.toHaveBeenCalled();
  });

  it("refuses to replace a different identity from the same provider", async () => {
    user.findUnique.mockResolvedValue(existingUser);
    account.findFirst.mockResolvedValue({ providerAccountId: "other-apple-sub" });

    await expect(
      resolveOAuthIdentity({
        provider: "apple",
        providerAccountId: "new-apple-sub",
        email: "chef@example.com",
        name: null,
      }),
    ).rejects.toThrow("oauth_provider_conflict");
    expect(account.create).not.toHaveBeenCalled();
  });
});
