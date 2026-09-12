// Consistent PostgreSQL archive with an integrity manifest. Read-only source.
// No credentials in argv or logs. Requires pg_dump/pg_restore in PATH or PG_BIN_DIR.
// node scripts/db-backup.mjs [destination-directory]
import { createBackup } from "./lib/pg-backup.mjs";

try {
  const result = await createBackup({
    databaseUrl: process.env.DATABASE_URL,
    outDir: process.argv[2] ?? "C:/Users/Utente/Desktop/ATELIER-BACKUPS/db",
  });
  console.log(JSON.stringify({ status: "completed", archive: result.archive, manifest: result.manifestPath, bytes: result.manifest.bytes, externalFilesIncluded: false }));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
