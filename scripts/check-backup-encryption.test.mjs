import assert from "node:assert/strict";
import { test } from "node:test";
import { randomBytes } from "node:crypto";
import { decryptBackup, encryptBackup } from "./lib/backup-encryption.mjs";
test("binary, UTF-8 and empty backups round-trip", () => {
  for (const data of [Buffer.alloc(0), Buffer.from("Receta ñ 🍋\n\0"), randomBytes(2_000_000)]) {
    const key = randomBytes(32), encoded = encryptBackup(data, key);
    assert.deepEqual(decryptBackup(encoded, key), data);
    assert.notDeepEqual(encryptBackup(data, key), encoded, "fresh nonce on repeated backups");
  }
});
test("wrong keys, corruption and truncation release no plaintext", () => {
  const key = randomBytes(32), encoded = encryptBackup(randomBytes(200), key);
  assert.throws(() => decryptBackup(encoded, randomBytes(32)), /incorrecta/);
  for (const offset of [0, 17, 60, encoded.length - 1]) {
    const damaged = Buffer.from(encoded); damaged[offset] ^= 1;
    assert.throws(() => decryptBackup(damaged, key));
  }
  for (const length of [0, 10, encoded.length - 1]) assert.throws(() => decryptBackup(encoded.subarray(0, length), key));
});
test("invalid key length cannot create a backup", () => {
  assert.throws(() => encryptBackup(Buffer.from("test"), randomBytes(16)), /32 bytes/);
});
