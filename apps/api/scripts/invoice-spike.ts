// Feasibility gate for the invoice scanner (spec, delivery order step 0).
// Reads invoice files with the production extraction and reports, per document, the merged
// header, every line and whether the lines add up. Pages of one document are listed together;
// "--doc" starts the next document.
//
// Uso:
//   cd apps/api
//   ../../packages/db/node_modules/.bin/tsx scripts/invoice-spike.ts a.jpg b.jpg --doc c.jpg
//
// Uses the dev database (generation budget) and the Z.ai key from .env.local.
// Writes invoice-spike-report.json next to the first file, with the full readings.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";

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
import { checkInvoiceTotals, mergeInvoicePages } from "../lib/invoices/totals";

const MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

const mimeFor = (file: string) => MIME[extname(file).toLowerCase()] ?? "application/octet-stream";

async function main() {
  const files = process.argv.slice(2);
  if (files.length === 0) throw new Error("usage: invoice-spike.ts <file>... [--doc <file>...]");
  const docs: string[][] = [[]];
  for (const arg of files) {
    if (arg === "--doc") docs.push([]);
    else docs[docs.length - 1]!.push(arg);
  }
  const report: unknown[] = [];
  for (const doc of docs.filter((d) => d.length > 0)) {
    const started = Date.now();
    try {
      const pages = [];
      for (const file of doc) pages.push(await extractInvoicePage(readFileSync(file), mimeFor(file)));
      const merged = mergeInvoicePages(pages);
      const totals = checkInvoiceTotals(merged.lines, merged.header);
      report.push({ files: doc, ms: Date.now() - started, header: merged.header, lines: merged.lines, droppedLines: merged.droppedLines, totals });
      console.log(`
== ${doc.join(" + ")} — ${merged.header.supplierName ?? "?"} #${merged.header.invoiceNumber ?? "?"} ${merged.header.invoiceDate ?? "?"} — net ${merged.header.netTotalCents ?? "-"} gross ${merged.header.grossTotalCents ?? "-"} — totals ${totals.status} (${totals.diffCents ?? "-"}) — dropped ${merged.droppedLines} — ${Date.now() - started}ms`);
      for (const l of merged.lines) {
        console.log(`  ${l.kind} | ${l.description} | ${l.quantity ?? "-"} ${l.unit ?? ""} | pack ${l.packQty ?? "-"} ${l.packUnit ?? ""} | ${l.unitPriceCents ?? "-"} | ${l.taxRatePct ?? "-"}% | ${l.lineTotalCents ?? "-"}`);
      }
    } catch (error) {
      console.log(`
== ${doc.join(" + ")}: FAILED ${error instanceof Error ? error.message : String(error)}`);
      report.push({ files: doc, ms: Date.now() - started, error: error instanceof Error ? error.message : String(error) });
    }
  }
  writeFileSync(join(dirname(docs[0]![0] ?? files[0]!), "invoice-spike-report.json"), JSON.stringify(report, null, 2));
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
