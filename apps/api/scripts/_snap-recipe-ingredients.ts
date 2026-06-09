// Snapshot quick read-only de RecipeIngredient para verificar backfill.
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
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
})();

import { prisma } from "@atelier/db";

async function main() {
  const total = await prisma.recipeIngredient.count();
  const withQty = await prisma.recipeIngredient.count({
    where: { qty: { not: null } },
  });
  const withoutQty = await prisma.recipeIngredient.count({ where: { qty: null } });
  console.log(`Total RecipeIngredient:  ${total}`);
  console.log(`Con qty (no null):       ${withQty}`);
  console.log(`Sin qty (null):          ${withoutQty}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
