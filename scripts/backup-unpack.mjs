// Decrypt only into a new private directory; never restore into production.
// node scripts/backup-unpack.mjs ARCHIVE KEY_FILE NEW_DIRECTORY
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { decryptBackup, loadBackupKey, sha256 } from "./lib/backup-encryption.mjs";
import { verifyBackup } from "./lib/pg-backup.mjs";
const exec = promisify(execFile);
try {
  const [archive, keyFile, destination] = process.argv.slice(2);
  if (!archive || !keyFile || !destination) throw new Error("Indica archivo, clave y carpeta nueva.");
  const key = await loadBackupKey(keyFile);
  const data = decryptBackup(await readFile(archive), key); key.fill(0);
  const target = resolve(destination);
  // No recursive mkdir: destination must not exist, parent must be private.
  await mkdir(target, { mode: 0o700 });
  const tar = join(target, "bundle.tar");
  await writeFile(tar, data, { flag: "wx", mode: 0o600 });
  const { stdout: listing } = await exec("tar", ["-tf", tar], { windowsHide: true });
  const paths = listing.trim().split(/\r?\n/);
  if (paths.some(p => !/^(bundle\.json|database\/?|files\/?|database\/atelier-db-[\w-]+\.dump(?:\.json)?|files\/[a-f0-9]{64}\.bin)$/.test(p))) throw new Error("Rutas de archivo no admitidas.");
  const { stdout: details } = await exec("tar", ["-tvf", tar], { windowsHide: true });
  if (details.trim().split(/\r?\n/).some(line => !/^[d-]/.test(line))) throw new Error("La copia contiene enlaces u objetos no admitidos.");
  await exec("tar", ["-xf", tar, "-C", target], { windowsHide: true });
  const manifest = JSON.parse(await readFile(join(target, "bundle.json"), "utf8"));
  if (manifest.format !== "atelier-full-backup" || manifest.version !== 1 || !paths.includes(manifest.databaseArchive)) throw new Error("Manifiesto no válido.");
  const db = await verifyBackup(join(target, manifest.databaseArchive));
  for (const file of manifest.files) {
    if (!paths.includes(file.filename) || !/^files\/[a-f0-9]{64}\.bin$/.test(file.filename)) throw new Error("Archivo no incluido.");
    const bytes = await readFile(join(target, file.filename));
    if (bytes.length !== file.bytes || sha256(bytes) !== file.sha256) throw new Error("Archivo incompleto o modificado.");
  }
  await rm(tar);
  console.log(JSON.stringify({ status: "verified", directory: target, files: manifest.files.length, databaseSha256: db.sha256, restoredToDatabase: false }));
} catch { console.error("No se pudo verificar la recuperación. No se modificó ninguna base de datos."); process.exitCode = 1; }
