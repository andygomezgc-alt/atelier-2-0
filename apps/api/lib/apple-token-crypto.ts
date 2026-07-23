import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const VERSION = "v1";

function tokenEncryptionKey(): Buffer {
  const raw = process.env.APPLE_TOKEN_ENCRYPTION_KEY?.trim();
  if (!raw) throw new Error("apple_token_encryption_not_configured");

  const key = /^[a-f\d]{64}$/i.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("apple_token_encryption_invalid");
  return key;
}

export function encryptAppleToken(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", tokenEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptAppleToken(value: string): string {
  const [version, ivPart, tagPart, encryptedPart, ...extra] = value.split(".");
  if (
    version !== VERSION ||
    !ivPart ||
    !tagPart ||
    !encryptedPart ||
    extra.length > 0
  ) {
    throw new Error("apple_token_encryption_format_invalid");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    tokenEncryptionKey(),
    Buffer.from(ivPart, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedPart, "base64url")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
