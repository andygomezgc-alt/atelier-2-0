// apps/api/scripts/invoice-storage-smoke.ts
// Checks that the configured Blob store accepts private files: put, read back, delete.
// Uso: cd apps/api && ../../packages/db/node_modules/.bin/tsx scripts/invoice-storage-smoke.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

for (const line of readFileSync(join(__dirname, "..", ".env.local"), "utf8").split(/\r?\n/)) {
  const eq = line.indexOf("=");
  if (eq < 0 || line.trim().startsWith("#")) continue;
  const key = line.slice(0, eq).trim();
  if (!process.env[key]) process.env[key] = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
}

async function main() {
  const { deleteInvoiceFiles, readInvoiceFile, storeInvoiceFile } = await import("../lib/invoices/storage");
  const key = await storeInvoiceFile("smoke", "smoke", new TextEncoder().encode("private-ok"), "application/pdf");
  const back = await readInvoiceFile(key);
  console.log("read back:", back ? new TextDecoder().decode(back) : null);
  await deleteInvoiceFiles([key]);
}
main().catch((error) => { console.error("FAILED", error instanceof Error ? error.message : error); process.exit(1); });
