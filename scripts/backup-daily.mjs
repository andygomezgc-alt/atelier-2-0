// Deterministic daily backup; Drive desktop stages uploads, web confirmation is separate.
// node scripts/backup-daily.mjs CONFIG [--confirm-cloud ARCHIVE_NAME]
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, readdir, rm, rename } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkArchive, syncArchive, isArchiveName } from "./lib/backup-sync.mjs";

const exec = promisify(execFile);
const dateInRome = value => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
async function readJson(path) {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}
async function saveState(path, value) {
  await writeFile(`${path}.partial`, JSON.stringify(value, null, 2), { mode: 0o600 });
  await rename(`${path}.partial`, path);
}

async function main() {
  const [configPath, mode, requestedName] = process.argv.slice(2);
  if (!configPath || (mode && mode !== "--confirm-cloud") || (mode && !isArchiveName(requestedName ?? ""))) throw new Error("Argumentos no válidos.");
  const config = await readJson(resolve(configPath));
  const root = resolve(config.rootDir);
  const archivesDir = join(root, "archives");
  if (!config.driveDir || !config.driveTargetId || config.driveFolderUrl !== "https://drive.google.com/drive/folders/1RC5Mht61LVFcJ8G4IxJYGGRqLmt35S4F") throw new Error("Falta configurar el destino privado autorizado.");
  const statePath = join(root, "last-daily.json");
  const lock = join(root, "daily.lock");
  await writeFile(lock, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }), { flag: "wx", mode: 0o600 });
  let phase = "prepare";
  let latest;
  try {
    const previous = await readJson(statePath);
    if (mode === "--confirm-cloud") {
      // The operator must first observe this exact file in the authorized Drive web folder.
      if (previous?.archive?.name !== requestedName || !["awaiting_cloud_confirmation", "cloud_confirmed"].includes(previous.status)) throw new Error("La confirmación no corresponde a la última copia encolada.");
      const checked = await syncArchive({ archive: join(archivesDir, requestedName), archivesDir, driveDir: config.driveDir, targetId: config.driveTargetId });
      if (checked.sha256 !== previous.archive.sha256 || checked.created) throw new Error("Se requiere volver a comprobar el archivo en Drive web.");
      const confirmed = { ...previous, status: "cloud_confirmed", cloudConfirmedAt: new Date().toISOString(), confirmationMethod: "operator_observed_drive_web", archive: { ...previous.archive, cloudConfirmed: true } };
      await saveState(statePath, confirmed);
      console.log(JSON.stringify(confirmed));
      return;
    }
    const today = dateInRome(Date.now());
    latest = await readJson(join(root, "last-run.json"));
    let created = false;
    if (latest?.status !== "completed" || dateInRome(latest.completedAt) !== today) {
      phase = "production_backup";
      const { stdout } = await exec(process.execPath, [fileURLToPath(new URL("backup-production.mjs", import.meta.url)), resolve(configPath)], { windowsHide: true, timeout: 600_000, maxBuffer: 64 * 1024 });
      latest = JSON.parse(stdout.trim());
      created = true;
    }
    phase = "verify_local";
    const checked = await checkArchive(latest.archive, archivesDir);
    // Recover older archives that could not reach Drive on an earlier day as well.
    phase = "stage_drive";
    const names = (await readdir(archivesDir)).filter(isArchiveName).sort();
    let uploaded = 0;
    for (const name of names) {
      const result = await syncArchive({ archive: join(archivesDir, name), archivesDir, driveDir: config.driveDir, targetId: config.driveTargetId });
      if (result.created) uploaded++;
    }
    const wasConfirmed = previous?.status === "cloud_confirmed" && previous.archive?.name === checked.name && previous.archive?.sha256 === checked.sha256 && uploaded === 0;
    const state = {
      status: wasConfirmed ? "cloud_confirmed" : "awaiting_cloud_confirmation",
      checkedAt: new Date().toISOString(), day: today, newBackupCreated: created,
      archive: { name: checked.name, bytes: checked.bytes, sha256: checked.sha256, cloudConfirmed: wasConfirmed },
      driveFolderUrl: config.driveFolderUrl, retainedArchives: names.length, newlyStagedArchives: uploaded,
      retention: "Keep all pilot archives; no automatic deletion",
      ...(wasConfirmed ? { cloudConfirmedAt: previous.cloudConfirmedAt, confirmationMethod: previous.confirmationMethod } : {}),
    };
    await saveState(statePath, state);
    console.log(JSON.stringify(state));
  } catch {
    if (mode !== "--confirm-cloud") await saveState(statePath, { status: "failed", phase, checkedAt: new Date().toISOString(), localBackupPreserved: latest?.status === "completed" });
    throw new Error(`La rutina no se completó (${phase}). Se conservan las copias anteriores; revisar el estado privado.`);
  } finally { await rm(lock); }
}
main().catch(() => { console.error("No se completó la copia diaria. Revisar last-daily.json, configuración, acceso a Drive y bloqueos; no borrar copias ni claves."); process.exitCode = 1; });
