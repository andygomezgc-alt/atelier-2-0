import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

export function connection(url) {
  if (!url) throw new Error("Falta la URL de conexión.");
  const parsed = new URL(url);
  const database = decodeURIComponent(parsed.pathname.slice(1));
  if (!["postgres:", "postgresql:"].includes(parsed.protocol) || !parsed.hostname || !/^[a-zA-Z0-9_-]+$/.test(database)) {
    throw new Error("Se requiere una URL PostgreSQL con un nombre de base simple.");
  }
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith("PG")));
  Object.assign(env, {
    PGHOST: parsed.hostname, PGPORT: parsed.port || "5432", PGDATABASE: database,
    PGUSER: decodeURIComponent(parsed.username), PGPASSWORD: decodeURIComponent(parsed.password),
    PGSSLMODE: parsed.searchParams.get("sslmode") || "prefer", PGCONNECT_TIMEOUT: "20",
    PGCLIENTENCODING: "UTF8", PGAPPNAME: "atelier-backup",
  });
  if (parsed.searchParams.has("channel_binding")) env.PGCHANNELBINDING = parsed.searchParams.get("channel_binding");
  return { env, database, host: parsed.hostname, port: parsed.port || "5432" };
}

export function targetLabel(info) { return `${info.host.replace(/-pooler(?=\.)/, "")}:${info.port}/${info.database}`; }

export async function runPg(name, args, info) {
  const executable = process.env.PG_BIN_DIR ? join(process.env.PG_BIN_DIR, `${name}${process.platform === "win32" ? ".exe" : ""}`) : name;
  return new Promise((resolveRun, reject) => {
    const child = spawn(executable, args, { env: info?.env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    child.stdout.setEncoding("utf8").on("data", (part) => { stdout += part; });
    // Do not copy database content or credentials from PostgreSQL errors to logs.
    child.stderr.resume();
    child.once("error", () => reject(new Error(`No se pudo ejecutar ${name}. Instala las herramientas PostgreSQL o configura PG_BIN_DIR.`)));
    child.once("close", (code) => code === 0 ? resolveRun(stdout.trim()) : reject(new Error(`${name} falló (código ${code}). No se confirmó la operación.`)));
  });
}

export async function checksum(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

export async function createBackup({ databaseUrl, outDir, snapshot }) {
  if (snapshot && !/^[a-fA-F0-9-]+$/.test(snapshot)) throw new Error("Instantánea PostgreSQL no válida.");
  const source = connection(databaseUrl);
  const pgVersion = await runPg("pg_dump", ["--version"], source);
  const directory = resolve(outDir);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const name = `atelier-db-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}.dump`;
  const archive = join(directory, name);
  const partial = `${archive}.partial`;
  const manifestPath = `${archive}.json`;
  try {
    await writeFile(partial, "", { flag: "wx", mode: 0o600 });
    await runPg("pg_dump", ["--no-password", "--format=custom", "--no-owner", "--no-privileges", "--lock-wait-timeout=30s", ...(snapshot ? [`--snapshot=${snapshot}`] : []), `--file=${partial}`], source);
    await runPg("pg_restore", ["--list", partial], source);
    const manifest = {
      format: "atelier-pg-backup", version: 1, completedAt: new Date().toISOString(),
      archive: name, source: { host: source.host, port: source.port, database: source.database },
      pgVersion, sha256: await checksum(partial), bytes: (await stat(partial)).size,
      scope: "whole-database", externalFilesIncluded: false,
    };
    await writeFile(`${manifestPath}.partial`, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    await rename(partial, archive);
    // Only the complete pair is accepted by the restore tool.
    await rename(`${manifestPath}.partial`, manifestPath);
    return { archive, manifestPath, manifest };
  } catch (error) {
    await unlink(partial).catch(() => {});
    await unlink(`${manifestPath}.partial`).catch(() => {});
    throw error;
  }
}

export async function verifyBackup(archive) {
  const manifest = JSON.parse(await readFile(`${archive}.json`, "utf8"));
  if (manifest.format !== "atelier-pg-backup" || manifest.version !== 1 || manifest.archive !== basename(archive) ||
      !manifest.source?.host || !manifest.source?.database || !manifest.source?.port || !/^[a-f0-9]{64}$/.test(manifest.sha256)) {
    throw new Error("Manifiesto de copia no válido o no compatible.");
  }
  if ((await stat(archive)).size !== manifest.bytes || await checksum(archive) !== manifest.sha256) {
    throw new Error("La copia está incompleta o fue modificada; no se restaurará.");
  }
  await runPg("pg_restore", ["--list", archive]);
  return manifest;
}

const EMPTY_TARGET_SQL = `SELECT
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema') +
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema') +
  (SELECT count(*) FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname NOT IN ('public','information_schema')) +
  (SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema') +
  (SELECT count(*) FROM pg_extension WHERE extname <> 'plpgsql');`;

export async function restoreBackup({ archive, databaseUrl, apply = false }) {
  const manifest = await verifyBackup(archive);
  const target = connection(databaseUrl);
  if (targetLabel(target) === targetLabel(manifest.source)) throw new Error("El destino coincide con el origen. Usa una base nueva y vacía.");
  const objects = await runPg("psql", ["-X", "--no-password", "--tuples-only", "--no-align", "--set=ON_ERROR_STOP=1", "--command", EMPTY_TARGET_SQL], target);
  if (objects !== "0") throw new Error("El destino no está vacío. No se borrará ni sobrescribirá ningún dato.");
  if (!apply) return { status: "verified", target: targetLabel(target) };
  // No --clean or --create: never delete a target or switch to the source database.
  await runPg("pg_restore", ["--no-password", "--exit-on-error", "--single-transaction", "--no-owner", "--no-privileges", `--dbname=${target.database}`, archive], target);
  return { status: "restored", target: targetLabel(target) };
}
