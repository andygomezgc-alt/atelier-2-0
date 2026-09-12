import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

// Versioned AES-256-GCM envelope. A fresh 96-bit nonce per archive. The magic
// and nonce are authenticated; plaintext is never returned before tag check.
const MAGIC = Buffer.from("ATELIER-BACKUP-1\0");
const MAX_BYTES = 256 * 1024 * 1024;
export function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function checkKey(key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error("La clave de recuperación debe tener 32 bytes.");
}
export function encryptBackup(plaintext, key) {
  checkKey(key);
  if (plaintext.length > MAX_BYTES) throw new Error("Copia demasiado grande para este empaquetador; requiere streaming antes de ampliar el piloto.");
  const nonce = randomBytes(12);
  const header = Buffer.concat([MAGIC, nonce]);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(header);
  const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([header, body, cipher.getAuthTag()]);
}
export function decryptBackup(envelope, key) {
  checkKey(key);
  if (envelope.length < MAGIC.length + 28 || envelope.length > MAX_BYTES + MAGIC.length + 28 || !envelope.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("Formato de copia cifrada no válido.");
  const endHeader = MAGIC.length + 12;
  const decipher = createDecipheriv("aes-256-gcm", key, envelope.subarray(MAGIC.length, endHeader));
  decipher.setAAD(envelope.subarray(0, endHeader));
  decipher.setAuthTag(envelope.subarray(-16));
  try { return Buffer.concat([decipher.update(envelope.subarray(endHeader, -16)), decipher.final()]); }
  catch { throw new Error("Clave incorrecta o copia dañada; no se ha recuperado ningún archivo."); }
}
export async function loadBackupKey(path, { create = false } = {}) {
  try { const key = await readFile(path); checkKey(key); return key; }
  catch (error) {
    if (!create || error.code !== "ENOENT") throw error;
    const key = randomBytes(32);
    await writeFile(path, key, { flag: "wx", mode: 0o600 });
    return key;
  }
}
