// BYOK API key encryption — AES-256-GCM.
//
// El usuario guarda su clave del LLM (Anthropic/OpenAI/Google) en
// `User.customApiKey`. Antes la columna era plaintext; ahora se cifra al
// guardar y se descifra al usar, con detección automática del formato
// legacy (sin prefijo) para self-healing sin migración SQL.
//
// Formato del ciphertext: `v1:${base64(iv ++ tag ++ enc)}`
//   - iv  : 12 bytes random por encripción
//   - tag : 16 bytes GCM auth tag
//   - enc : ciphertext del plaintext (variable)
// El prefijo `v1:` permite versionar el esquema si en el futuro cambiamos
// algoritmo o key derivation.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;
const PREFIX = "v1:";

function getKey(): Buffer {
  const raw = process.env.BYOK_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "BYOK_ENCRYPTION_KEY no está set. Generala con `openssl rand -base64 32` " +
        "y agregala a apps/api/.env.local.",
    );
  }
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error(
      `BYOK_ENCRYPTION_KEY debe ser 32 bytes en base64 (recibí ${buf.length} bytes). ` +
        "Regeneralo con `openssl rand -base64 32`.",
    );
  }
  return buf;
}

/** True si el string ya tiene el prefijo de nuestro formato cifrado. */
export function isEncrypted(s: string): boolean {
  return typeof s === "string" && s.startsWith(PREFIX);
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decrypt(ciphertext: string): string {
  if (!isEncrypted(ciphertext)) {
    throw new Error("not in v1 ciphertext format");
  }
  const buf = Buffer.from(ciphertext.slice(PREFIX.length), "base64");
  if (buf.length < IV_LEN + TAG_LEN) {
    throw new Error("ciphertext too short");
  }
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const enc = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString("utf8");
}
