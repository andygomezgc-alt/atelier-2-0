import { generateKeyPairSync } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodeProtectedHeader } from "jose";
import {
  appleClientId,
  AppleAuthError,
  exchangeAppleAuthorizationCode,
  extractAppleProfile,
  revokeAppleRefreshToken,
} from "../apple-auth";

describe("extractAppleProfile", () => {
  it("normalizes a verified email and checks the nonce", () => {
    expect(
      extractAppleProfile(
        {
          sub: "apple-user-123",
          email: "Chef@Privaterelay.AppleID.com",
          email_verified: "true",
          is_private_email: "true",
          nonce: "one-time-nonce",
        },
        "one-time-nonce",
      ),
    ).toEqual({
      subject: "apple-user-123",
      email: "chef@privaterelay.appleid.com",
      isPrivateEmail: true,
    });
  });

  it("allows a returning identity token without email", () => {
    expect(extractAppleProfile({ sub: "apple-user-123" })).toEqual({
      subject: "apple-user-123",
      email: null,
      isPrivateEmail: false,
    });
  });

  it("rejects a response from a different login attempt", () => {
    expect(() =>
      extractAppleProfile(
        { sub: "apple-user-123", nonce: "other-nonce" },
        "expected-nonce",
      ),
    ).toThrow("apple_nonce_mismatch");
  });

  it("rejects missing permanent subject", () => {
    expect(() => extractAppleProfile({ email_verified: true })).toThrow(
      "apple_subject_missing",
    );
  });

  it("rejects an unverified email", () => {
    expect(() =>
      extractAppleProfile({
        sub: "apple-user-123",
        email: "chef@example.com",
        email_verified: false,
      }),
    ).toThrow("apple_email_unverified");
  });
});

describe("appleClientId", () => {
  const previous = process.env.APPLE_CLIENT_ID;

  afterEach(() => {
    if (previous === undefined) delete process.env.APPLE_CLIENT_ID;
    else process.env.APPLE_CLIENT_ID = previous;
  });

  it("requires explicit server configuration", () => {
    delete process.env.APPLE_CLIENT_ID;
    expect(() => appleClientId()).toThrowError(AppleAuthError);
    expect(() => appleClientId()).toThrow("apple_not_configured");
  });
});

describe("Apple token endpoint", () => {
  const previous = { ...process.env };

  beforeEach(() => {
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    process.env.APPLE_CLIENT_ID = "com.atelierchef.app";
    process.env.APPLE_TEAM_ID = "TEAM123456";
    process.env.APPLE_KEY_ID = "KEY123456";
    process.env.APPLE_PRIVATE_KEY = privateKey
      .export({ format: "pem", type: "pkcs8" })
      .toString();
  });

  afterEach(() => {
    process.env = { ...previous };
    vi.unstubAllGlobals();
  });

  it("exchanges the one-time code with an ES256 client secret", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "access-token",
          refresh_token: "refresh-token",
          expires_in: 3600,
          id_token: "id-token",
          token_type: "Bearer",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(exchangeAppleAuthorizationCode("authorization-code")).resolves.toEqual({
      refreshToken: "refresh-token",
      idToken: "id-token",
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://appleid.apple.com/auth/token");
    const form = init.body as URLSearchParams;
    expect(form.get("client_id")).toBe("com.atelierchef.app");
    expect(form.get("code")).toBe("authorization-code");
    expect(form.get("grant_type")).toBe("authorization_code");
    expect(decodeProtectedHeader(form.get("client_secret")!)).toMatchObject({
      alg: "ES256",
      kid: "KEY123456",
    });
  });

  it("sends the stored refresh token to Apple's revoke endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await revokeAppleRefreshToken("refresh-token");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://appleid.apple.com/auth/revoke");
    const form = init.body as URLSearchParams;
    expect(form.get("token")).toBe("refresh-token");
    expect(form.get("token_type_hint")).toBe("refresh_token");
  });

  it("rejects an exchange response without a refresh token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            access_token: "access-token",
            expires_in: 3600,
            id_token: "id-token",
            token_type: "Bearer",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    await expect(exchangeAppleAuthorizationCode("authorization-code")).rejects.toThrow(
      "apple_exchange_invalid_response",
    );
  });
});
