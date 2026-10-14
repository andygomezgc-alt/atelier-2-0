// Feasibility gate for the invoice scanner (spec, delivery order step 0).
// Reads every invoice file in a folder with the production extraction and
// reports, per file, how many lines were read and whether they add up.
//
// Uso:
//   cd apps/api
//   ../../packages/db/node_modules/.bin/tsx scripts/invoice-spike.ts <carpeta-con-facturas>
//
// Uses the dev database (generation budget) and the Z.ai key from .env.local.
// Writes <carpeta>/invoice-spike-report.json with the full readings.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";

(() => {
  const envPath = join(__dirname, "..", ".env.local");
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
})();

import { extractInvoicePage } from "../lib/invoices/extraction";
import { checkTotals } from "../lib/invoices/totals";

const MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

async function main() {
  const dir = process.argv[2];
  if (!dir) throw new Error("usage: invoice-spike.ts <folder>");
  const files = readdirSync(dir).filter((f) => MIME[extname(f).toLowerCase()]);
  const report: unknown[] = [];
  for (const file of files) {
    const started = Date.now();
    try {
      const page = await extractInvoicePage(readFileSync(join(dir, file)), MIME[extname(file).toLowerCase()]!);
      const totals = checkTotals(page.lines.map((l) => l.lineTotalCents), page.netTotalCents);
      const withTax = page.lines.filter((l) => l.taxRatePct !== null).length;
      console.log(
        `${file}: ${page.supplierName ?? "?"} #${page.invoiceNumber ?? "?"} ${page.invoiceDate ?? "?"} | ` +
          `lines=${page.lines.length} dropped=${page.droppedLines} withTax=${withTax} | ` +
          `totals=${totals.status} diff=${totals.diffCents ?? "-"} | ${Date.now() - started}ms`,
      );
      report.push({ file, ms: Date.now() - started, totals, page });
    } catch (error) {
      console.log(`${file}: FAILED ${error instanceof Error ? error.message : String(error)}`);
      report.push({ file, ms: Date.now() - started, error: error instanceof Error ? error.message : String(error) });
    }
  }
  writeFileSync(join(dir, "invoice-spike-report.json"), JSON.stringify(report, null, 2));
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
