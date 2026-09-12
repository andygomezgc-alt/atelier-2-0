// Operational backup only: no migrations, writes to production, or AI calls.
// node scripts/backup-production.mjs /absolute/path/config.json
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify, parseEnv } from "node:util";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile, rename, rm, stat } from "node:fs/promises";
import { resolve, join, relative, isAbsolute, basename } from "node:path";
import { createBackup, verifyBackup } from "./lib/pg-backup.mjs";
import { encryptBackup, decryptBackup, loadBackupKey, sha256 } from "./lib/backup-encryption.mjs";

const exec = promisify(execFile);
const requireDb = createRequire(new URL("../packages/db/package.json", import.meta.url));
const requireApi = createRequire(new URL("../apps/api/package.json", import.meta.url));
const { PrismaClient } = requireDb("@prisma/client");
const { list } = requireApi("@vercel/blob");
const MAX_FILES_BYTES = 128 * 1024 * 1024;

export function requireInside(root, path) {
  const rel = relative(resolve(root), resolve(path));
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) throw new Error("Ruta de trabajo fuera de la carpeta de copias.");
}
async function main() {
  const config = JSON.parse(await readFile(process.argv[2], "utf8"));
  const root = resolve(config.rootDir);
  const keyPath = join(root, "keys", "recovery.key");
  // The setup step creates an owner-only directory before any sensitive data.
  if (!(await stat(root)).isDirectory()) throw new Error("Falta preparar la carpeta protegida.");
  const env = parseEnv(await readFile(resolve(config.envFile), "utf8"));
  const url = new URL(env.DATABASE_URL);
  if (url.hostname !== config.expectedHost || url.pathname !== "/neondb" || !url.searchParams.get("sslmode")) throw new Error("El origen no coincide con la producción configurada.");
  if (!env.BLOB_READ_WRITE_TOKEN || !/^[a-z0-9]+\.public\.blob\.vercel-storage\.com$/.test(config.blobHost)) throw new Error("Falta el almacén de archivos autorizado.");
  url.hostname = url.hostname.replace(/-pooler(?=\.)/, "");
  process.env.PG_BIN_DIR = resolve(config.pgBinDir);
  const key = await loadBackupKey(keyPath);
  const lockPath = join(root, "running.lock");
  await writeFile(lockPath, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }), { flag: "wx", mode: 0o600 });
  const workingRoot = join(root, "working");
  const work = join(workingRoot, randomUUID());
  requireInside(workingRoot, work);
  const client = new PrismaClient({ datasourceUrl: url.href });
  let stage = "preparation";
  try {
    await mkdir(join(work, "database"), { recursive: true, mode: 0o700 });
    await mkdir(join(work, "files"), { mode: 0o700 });
    await mkdir(join(root, "archives"), { recursive: true, mode: 0o700 });
    stage = "database_and_files";
    const captured = await client.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
      const [{ snapshot }] = await tx.$queryRawUnsafe('SELECT pg_export_snapshot() AS snapshot');
      const refs = await tx.$queryRawUnsafe(`SELECT "photoUrl" AS url FROM "User" WHERE "photoUrl" IS NOT NULL
        UNION SELECT "photoUrl" FROM "Restaurant" WHERE "photoUrl" IS NOT NULL
        UNION SELECT "menuStyleRefUrl" FROM "Restaurant" WHERE "menuStyleRefUrl" IS NOT NULL
        UNION SELECT "refUrl" FROM "MenuStyleVersion" WHERE "refUrl" IS NOT NULL`);
      const blobs = new Map();
      let cursor;
      do {
        const page = await list({ token: env.BLOB_READ_WRITE_TOKEN, cursor, limit: 1000 });
        for (const blob of page.blobs) blobs.set(blob.url, blob);
        if (page.hasMore && (!page.cursor || page.cursor === cursor)) throw new Error("Paginación de archivos incompleta.");
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);
      const externalReferences = [];
      for (const { url: ref } of refs) {
        const parsed = new URL(ref);
        if (parsed.hostname.endsWith(".blob.vercel-storage.com")) {
          if (parsed.hostname !== config.blobHost || !blobs.has(ref)) throw new Error("Falta un archivo de la instantánea; no se marcará la copia como completa.");
        } else externalReferences.push(ref); // External avatars are not uploaded Blob assets.
      }
      if ([...blobs.values()].reduce((sum, blob) => sum + blob.size, 0) > MAX_FILES_BYTES) throw new Error("El tamaño de archivos supera el límite de este piloto.");
      const files = [];
      let total = 0;
      for (const blob of blobs.values()) {
        const parsed = new URL(blob.url);
        if (parsed.protocol !== "https:" || parsed.hostname !== config.blobHost || parsed.username || parsed.password) throw new Error("Origen de archivo no autorizado.");
        const response = await fetch(parsed.href, { redirect: "error", signal: AbortSignal.timeout(30_000) });
        if (!response.ok || !response.body) throw new Error("No se pudo descargar un archivo de la copia.");
        const chunks = []; let bytes = 0;
        for await (const chunk of response.body) {
          bytes += chunk.byteLength; total += chunk.byteLength;
          if (bytes > blob.size || total > MAX_FILES_BYTES) throw new Error("El archivo cambió de tamaño durante la copia.");
          chunks.push(Buffer.from(chunk));
        }
        if (bytes !== blob.size) throw new Error("Archivo incompleto.");
        const data = Buffer.concat(chunks);
        const filename = `${sha256(Buffer.from(blob.url))}.bin`;
        await writeFile(join(work, "files", filename), data, { flag: "wx", mode: 0o600 });
        files.push({ url: blob.url, pathname: blob.pathname, filename: `files/${filename}`, bytes, sha256: sha256(data), contentType: response.headers.get("content-type"), uploadedAt: blob.uploadedAt });
      }
      const backup = await createBackup({ databaseUrl: url.href, outDir: join(work, "database"), snapshot });
      await verifyBackup(backup.archive);
      return { databaseArchive: `database/${basename(backup.archive)}`, snapshot, files, externalReferences };
    }, { maxWait: 15_000, timeout: 300_000 });
    await writeFile(join(work, "bundle.json"), JSON.stringify({ format: "atelier-full-backup", version: 1, capturedAt: new Date().toISOString(), ...captured }, null, 2), { mode: 0o600 });
    stage = "encryption";
    const packed = join(work, "bundle.tar");
    await exec(config.tarPath ?? "tar", ["-cf", packed, "-C", work, "bundle.json", "database", "files"], { windowsHide: true });
    const plaintext = await readFile(packed);
    const encrypted = encryptBackup(plaintext, key);
    // Verify every byte after decryption before declaring a usable archive.
    if (sha256(decryptBackup(encrypted, key)) !== sha256(plaintext)) throw new Error("La comprobación del cifrado falló.");
    const name = `atelier-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}.atbak`;
    const archive = join(root, "archives", name);
    await writeFile(`${archive}.partial`, encrypted, { flag: "wx", mode: 0o600 });
    await rename(`${archive}.partial`, archive);
    const result = { status: "completed", completedAt: new Date().toISOString(), archive, bytes: encrypted.length, sha256: sha256(encrypted), uploadedFiles: captured.files.length, externalReferencesNotIncluded: captured.externalReferences.length, encrypted: true, verified: true, offsite: false };
    await writeFile(`${archive}.json`, JSON.stringify(result, null, 2), { flag: "wx", mode: 0o600 });
    await writeFile(join(root, "last-run.json"), JSON.stringify(result, null, 2), { mode: 0o600 });
    console.log(JSON.stringify(result));
  } catch {
    await writeFile(join(root, "last-run.json"), JSON.stringify({ status: "failed", stage, at: new Date().toISOString() }), { mode: 0o600 });
    throw new Error(`La copia no se completó (${stage}); se conservan las copias anteriores.`);
  } finally {
    key.fill(0);
    await client.$disconnect();
    // Only our UUID working directory, strictly below the configured root.
    requireInside(workingRoot, work);
    await rm(work, { recursive: true, force: true });
    await rm(lockPath);
  }
}
main().catch(error => { console.error(error.message.startsWith("La copia no se completó") ? error.message : "No se pudo iniciar la copia; revisar configuración o bloqueo de una ejecución anterior."); process.exitCode = 1; });
