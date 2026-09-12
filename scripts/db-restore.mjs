// Only restores our own validated backups to a DIFFERENT, EMPTY database.
// RESTORE_DATABASE_URL is mandatory; DATABASE_URL is never used as a fallback.
// node scripts/db-restore.mjs path/to/backup.dump [--apply]
// Without --apply, verifies the archive and target without writing.
import { resolve } from "node:path";
import { restoreBackup } from "./lib/pg-backup.mjs";

try {
  const [file, ...options] = process.argv.slice(2);
  if (!file || options.some((option) => option !== "--apply")) throw new Error("Uso: node scripts/db-restore.mjs copia.dump [--apply]");
  if (!process.env.RESTORE_DATABASE_URL) throw new Error("Falta RESTORE_DATABASE_URL. No se utilizará la conexión habitual de la app.");
  console.log(JSON.stringify(await restoreBackup({ archive: resolve(file), databaseUrl: process.env.RESTORE_DATABASE_URL, apply: options.includes("--apply") })));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
