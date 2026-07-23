import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => {
  class AppleAuthError extends Error {
    constructor(public readonly code: string) {
      super(code);
    }
  }
  class OAuthIdentityError extends Error {
    constructor(public readonly code: string) {
      super(code);
    }
  }
  return {
    AppleAuthError,
    OAuthIdentityError,
    verifyAppleIdToken: vi.fn(),
    exchangeAppleAuthorizationCode: vi.fn(),
    consumeAppleNonce: vi.fn(),
    encryptAppleToken: vi.fn(),
    resolveOAuthIdentity: vi.fn(),
    createMobileSession: vi.fn(),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
});

vi.mock("@/lib/apple-auth", () => ({
  AppleAuthError: mocks.AppleAuthError,
  verifyAppleIdToken: mocks.verifyAppleIdToken,
  exchangeAppleAuthorizationCode: mocks.exchangeAppleAuthorizationCode,
}));
vi.mock("@/lib/apple-nonce", () => ({ consumeAppleNonce: mocks.consumeAppleNonce }));
vi.mock("@/lib/apple-token-crypto", () => ({
  encryptAppleToken: mocks.encryptAppleToken,
}));
vi.mock("@/lib/oauth-identity", () => ({
  OAuthIdentityError: mocks.OAuthIdentityError,
  resolveOAuthIdentity: mocks.resolveOAuthIdentity,
}));
vi.mock("@/lib/mobile-session", () => ({
  createMobileSession: mocks.createMobileSession,
}));
vi.mock("@/lib/logger", () => ({ logger: mocks.logger }));

import { POST } from "../route";

function request(body: unknown) {
  return new NextRequest("https://test.local/api/mobile/auth/apple", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const firstProfile = {
  subject: "apple-sub-123",
  email: "chef@example.com",
  isPrivateEmail: false,
};
const user = { id: "user-1", email: "chef@example.com" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyAppleIdToken
    .mockResolvedValueOnce(firstProfile)
    .mockResolvedValueOnce({ ...firstProfile, email: null });
  mocks.consumeAppleNonce.mockResolvedValue(true);
  mocks.exchangeAppleAuthorizationCode.mockResolvedValue({
    refreshToken: "apple-refresh-token",
    idToken: "exchanged-id-token",
  });
  mocks.encryptAppleToken.mockReturnValue("encrypted-refresh-token");
  mocks.resolveOAuthIdentity.mockResolvedValue(user);
  mocks.createMobileSession.mockResolvedValue({
    accessToken: "atelier-token",
    user,
  });
});

describe("POST /api/mobile/auth/apple", () => {
  it("verifies both Apple tokens, consumes the nonce and stores only encrypted refresh", async () => {
    const response = await POST(
      request({
        identityToken: "native-id-token",
        authorizationCode: "one-time-code",
        nonce: "one-time-nonce",
        name: "Chef Apple",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ accessToken: "atelier-token", user });
    expect(mocks.verifyAppleIdToken).toHaveBeenNthCalledWith(
      1,
      "native-id-token",
      "one-time-nonce",
    );
    expect(mocks.consumeAppleNonce).toHaveBeenCalledWith("one-time-nonce");
    expect(mocks.exchangeAppleAuthorizationCode).toHaveBeenCalledWith("one-time-code");
    expect(mocks.verifyAppleIdToken).toHaveBeenNthCalledWith(
      2,
      "exchanged-id-token",
    );
    expect(mocks.encryptAppleToken).toHaveBeenCalledWith("apple-refresh-token");
    expect(mocks.resolveOAuthIdentity).toHaveBeenCalledWith({
      provider: "apple",
      providerAccountId: "apple-sub-123",
      email: "chef@example.com",
      name: "Chef Apple",
      tokens: { refreshToken: "encrypted-refresh-token" },
    });
  });

  it("rejects a replayed or expired nonce before exchanging the code", async () => {
    mocks.consumeAppleNonce.mockResolvedValue(false);

    const response = await POST(
      request({
        identityToken: "native-id-token",
        authorizationCode: "one-time-code",
        nonce: "replayed-nonce",
      }),
    );

    expect(response.status).toBe(401);
    expect(mocks.exchangeAppleAuthorizationCode).not.toHaveBeenCalled();
    expect(mocks.resolveOAuthIdentity).not.toHaveBeenCalled();
  });

  it("rejects when the exchanged code belongs to a different Apple user", async () => {
    mocks.verifyAppleIdToken
      .mockReset()
      .mockResolvedValueOnce(firstProfile)
      .mockResolvedValueOnce({
        subject: "different-apple-sub",
        email: "other@example.com",
        isPrivateEmail: false,
      });

    const response = await POST(
      request({
        identityToken: "native-id-token",
        authorizationCode: "one-time-code",
        nonce: "one-time-nonce",
      }),
    );

    expect(response.status).toBe(401);
    expect(mocks.resolveOAuthIdentity).not.toHaveBeenCalled();
  });

  it("rejects incomplete credentials without touching Apple", async () => {
    const response = await POST(request({ identityToken: "native-id-token" }));

    expect(response.status).toBe(400);
    expect(mocks.verifyAppleIdToken).not.toHaveBeenCalled();
    expect(mocks.consumeAppleNonce).not.toHaveBeenCalled();
  });

  it("returns a server error when Apple credentials are not configured", async () => {
    mocks.verifyAppleIdToken.mockReset().mockRejectedValue(
      new mocks.AppleAuthError("apple_not_configured"),
    );

    const response = await POST(
      request({
        identityToken: "native-id-token",
        authorizationCode: "one-time-code",
        nonce: "one-time-nonce",
      }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ code: "apple_signin_failed" });
  });

  it("does not disguise an unexpected database failure as invalid credentials", async () => {
    mocks.resolveOAuthIdentity.mockRejectedValueOnce(new Error("database unavailable"));

    const response = await POST(
      request({
        identityToken: "native-id-token",
        authorizationCode: "one-time-code",
        nonce: "one-time-nonce",
      }),
    );

    expect(response.status).toBe(500);
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "mobile_apple_failed",
      expect.objectContaining({ reason: "database unavailable", status: 500 }),
    );
  });
});
