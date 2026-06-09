import { readFileSync } from "node:fs";
import { join } from "node:path";
(() => {
  const raw = readFileSync(join(__dirname, "..", ".env.local"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
})();
import { prisma } from "@atelier/db";
async function main() {
  const rows = await prisma.product.findMany({
    where: { deletedAt: null },
    select: { category: true, unidadCompra: true },
  });
  const total = rows.length;
  const byCat = new Map<string, number>();
  const byUnit = new Map<string, number>();
  for (const r of rows) {
    byCat.set(r.category, (byCat.get(r.category) ?? 0) + 1);
    byUnit.set(r.unidadCompra, (byUnit.get(r.unidadCompra) ?? 0) + 1);
  }
  console.log(`Total productos: ${total}\n`);
  console.log(`Por categoría:`);
  for (const [k, v] of [...byCat.entries()].sort()) console.log(`  ${k.padEnd(16)} ${v}`);
  console.log(`\nPor unidadCompra:`);
  for (const [k, v] of [...byUnit.entries()].sort()) console.log(`  ${k.padEnd(8)} ${v}`);
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
