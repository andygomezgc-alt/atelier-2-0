import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { encryptBackup, sha256 } from "./lib/backup-encryption.mjs";
import { syncArchive, TARGET_MARKER } from "./lib/backup-sync.mjs";

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "atelier-sync-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const archivesDir = join(root, "archives");
  const driveDir = join(root, "drive");
  await mkdir(archivesDir); await mkdir(driveDir);
  const targetId = "test-destination-0123456789";
  await writeFile(join(driveDir, TARGET_MARKER), JSON.stringify({ format: "atelier-backup-target", id: targetId }));
  const name = "atelier-2026-09-11T09-00-00-000Z-aabbccdd.atbak";
  const archive = join(archivesDir, name);
  const data = encryptBackup(Buffer.from("synthetic backup, no chef data"), randomBytes(32));
  const manifest = { status: "completed", encrypted: true, verified: true, bytes: data.length, sha256: sha256(data) };
  await writeFile(archive, data);
  await writeFile(`${archive}.json`, JSON.stringify(manifest));
  return { root, archivesDir, driveDir, targetId, name, archive, data, manifest };
}

test("uploads exact encrypted bytes, omits keys, retries without overwriting or claiming cloud completion", async t => {
  const f = await fixture(t);
  await writeFile(join(f.archivesDir, "recovery.key"), randomBytes(32));
  const first = await syncArchive(f);
  assert.equal(first.created, true); assert.equal(first.cloudConfirmed, false);
  assert.deepEqual(await readFile(join(f.driveDir, f.name)), f.data);
  assert.deepEqual((await readdir(f.driveDir)).sort(), [TARGET_MARKER, f.name, `${f.name}.json`].sort());
  assert.equal((await syncArchive(f)).created, false);
});

test("rejects a changed Drive destination before copying data", async t => {
  const f = await fixture(t);
  await assert.rejects(syncArchive({ ...f, targetId: "different-account-0123456789" }), /destino autorizado/);
  assert.deepEqual(await readdir(f.driveDir), [TARGET_MARKER]);
});

test("rejects damaged archives and leaves existing backup untouched", async t => {
  const f = await fixture(t);
  await syncArchive(f);
  const damaged = Buffer.from(f.data); damaged[40] ^= 1;
  await writeFile(f.archive, damaged);
  await assert.rejects(syncArchive(f), /integridad/);
  assert.deepEqual(await readFile(join(f.driveDir, f.name)), f.data);
});

test("rejects plaintext even with a matching hash and encrypted metadata flag", async t => {
  const f = await fixture(t);
  const plaintext = Buffer.from("a plain SQL dump pretending to be an encrypted archive".repeat(3));
  await writeFile(f.archive, plaintext);
  await writeFile(`${f.archive}.json`, JSON.stringify({ ...f.manifest, bytes: plaintext.length, sha256: sha256(plaintext) }));
  await assert.rejects(syncArchive(f), /integridad/);
  assert.deepEqual(await readdir(f.driveDir), [TARGET_MARKER]);
});

test("does not replace a conflicting file already in Drive", async t => {
  const f = await fixture(t);
  const other = Buffer.from("existing file must stay");
  await writeFile(join(f.driveDir, f.name), other);
  await assert.rejects(syncArchive(f), /sobrescribirá/);
  assert.deepEqual(await readFile(join(f.driveDir, f.name)), other);
});

test("resumes missing manifest, retains the archive and reports a newly staged pair", async t => {
  const f = await fixture(t);
  await writeFile(join(f.driveDir, f.name), f.data);
  assert.equal((await syncArchive(f)).created, true);
  assert.deepEqual(await readFile(join(f.driveDir, `${f.name}.json`)), await readFile(`${f.archive}.json`));
});

test("rejects secret files and valid archives outside the source directory", async t => {
  const f = await fixture(t);
  await assert.rejects(syncArchive({ ...f, archive: join(f.root, "recovery.key") }), /paquetes cifrados/);
  const outside = join(f.root, f.name);
  await writeFile(outside, f.data);
  await assert.rejects(syncArchive({ ...f, archive: outside }), /fuera/);
});
