import { afterEach, describe, expect, it } from "vitest";
import { decryptAppleToken, encryptAppleToken } from "../apple-token-crypto";

describe("Apple refresh token encryption", () => {
  const previous = process.env.APPLE_TOKEN_ENCRYPTION_KEY;

  afterEach(() => {
    if (previous === undefined) delete process.env.APPLE_TOKEN_ENCRYPTION_KEY;
    else process.env.APPLE_TOKEN_ENCRYPTION_KEY = previous;
  });

  it("round-trips with AES-256-GCM without storing plaintext", () => {
    process.env.APPLE_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const encrypted = encryptAppleToken("sensitive-refresh-token");

    expect(encrypted).toMatch(/^v1\./);
    expect(encrypted).not.toContain("sensitive-refresh-token");
    expect(decryptAppleToken(encrypted)).toBe("sensitive-refresh-token");
  });

  it("rejects ciphertext that was modified", () => {
    process.env.APPLE_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    const encrypted = encryptAppleToken("refresh-token");
    const parts = encrypted.split(".");
    const ciphertext = Buffer.from(parts[3]!, "base64url");
    ciphertext[0] = ciphertext[0]! ^ 1;
    parts[3] = ciphertext.toString("base64url");
    const tampered = parts.join(".");

    expect(() => decryptAppleToken(tampered)).toThrow();
  });

  it("requires a 32-byte independent key", () => {
    process.env.APPLE_TOKEN_ENCRYPTION_KEY = "too-short";
    expect(() => encryptAppleToken("refresh-token")).toThrow(
      "apple_token_encryption_invalid",
    );
  });
});
