import { constants } from "node:fs";
import { copyFile, lstat, readFile, realpath, rm } from "node:fs/promises";
import { basename, dirname, join, relative, isAbsolute } from "node:path";
import { randomUUID } from "node:crypto";
import { sha256 } from "./backup-encryption.mjs";

const NAME = /^atelier-\d{4}-\d{2}-\d{2}T[\d-]+Z-[a-f0-9]{8}\.atbak$/;
const MAGIC = Buffer.from("ATELIER-BACKUP-1\0");
const MAX_BYTES = 256 * 1024 * 1024 + MAGIC.length + 28;
export const TARGET_MARKER = ".atelier-backup-target.json";

export async function checkedFile(path, maxBytes = MAX_BYTES) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > maxBytes) throw new Error("Archivo de copia no válido.");
  const data = await readFile(path);
  if (data.length !== info.size || data.length > maxBytes) throw new Error("El archivo cambió durante la comprobación.");
  return data;
}

export async function checkArchive(archive, archivesDir) {
  const name = basename(archive);
  if (!NAME.test(name)) throw new Error("Solo se admiten paquetes cifrados de Atelier.");
  const root = await realpath(archivesDir);
  if (await realpath(dirname(archive)) !== root) throw new Error("Copia fuera de la carpeta autorizada.");
  const data = await checkedFile(archive);
  const metaBytes = await checkedFile(`${archive}.json`, 16 * 1024);
  const meta = JSON.parse(metaBytes.toString("utf8"));
  if (!data.subarray(0, MAGIC.length).equals(MAGIC) || data.length < MAGIC.length + 28 ||
      meta.status !== "completed" || meta.encrypted !== true || meta.verified !== true ||
      meta.bytes !== data.length || meta.sha256 !== sha256(data)) throw new Error("La copia no supera la comprobación de integridad.");
  return { name, bytes: data.length, sha256: meta.sha256, metaBytes: metaBytes.length, metaSha256: sha256(metaBytes) };
}

export async function checkTarget(driveDir, targetId, archivesDir) {
  if (typeof targetId !== "string" || targetId.length < 16) throw new Error("Identidad del destino no válida.");
  const target = await realpath(driveDir);
  const source = await realpath(archivesDir);
  const rel = relative(source, target);
  if (!rel || (!rel.startsWith("..") && !isAbsolute(rel))) throw new Error("El destino debe ser independiente de la carpeta de origen.");
  const marker = JSON.parse((await checkedFile(join(target, TARGET_MARKER), 4096)).toString("utf8"));
  if (marker.format !== "atelier-backup-target" || marker.id !== targetId) throw new Error("Drive no corresponde al destino autorizado.");
  return target;
}

async function matches(path, bytes, hash) {
  const data = await checkedFile(path);
  return data.length === bytes && sha256(data) === hash;
}

async function copyVerified(source, destination, bytes, hash) {
  try {
    if (!await matches(destination, bytes, hash)) throw new Error("Existe una copia distinta en Drive; no se sobrescribirá.");
    return false;
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  const partial = join(dirname(destination), `.atelier-${randomUUID()}.partial`);
  try {
    await copyFile(source, partial, constants.COPYFILE_EXCL);
    if (!await matches(partial, bytes, hash)) throw new Error("La copia a Drive está incompleta.");
    // Exclusive creation preserves an existing archive even if another writer races us.
    try { await copyFile(partial, destination, constants.COPYFILE_EXCL); }
    catch (error) { if (error.code !== "EEXIST") throw error; }
    if (!await matches(destination, bytes, hash)) throw new Error("La copia de destino no coincide.");
    return true;
  } finally {
    // Only our generated single file, never a recursive delete or retention purge.
    await rm(partial, { force: true });
  }
}

export async function syncArchive({ archive, archivesDir, driveDir, targetId }) {
  const checked = await checkArchive(archive, archivesDir);
  const target = await checkTarget(driveDir, targetId, archivesDir);
  const created = await copyVerified(archive, join(target, checked.name), checked.bytes, checked.sha256);
  const manifestCreated = await copyVerified(`${archive}.json`, join(target, `${checked.name}.json`), checked.metaBytes, checked.metaSha256);
  return { name: checked.name, bytes: checked.bytes, sha256: checked.sha256, created: created || manifestCreated, cloudConfirmed: false };
}

export function isArchiveName(name) { return NAME.test(name); }
