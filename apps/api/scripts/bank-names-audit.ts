// Audit read-only de nombres de productos en el banco. Verifica que
// ninguno tenga cantidad/unidad pegada al nombre (lo que sería bug del
// parser de migración).
//
// Uso:
//   cd apps/api
//   ../../packages/db/node_modules/.bin/tsx scripts/bank-names-audit.ts

import { readFileSync } from "node:fs";
import { join } from "node:path";

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
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
})();

import { prisma } from "@atelier/db";
import { parseIngredient } from "../lib/products/parser";

async function main() {
  const restaurants = await prisma.restaurant.findMany({
    select: { id: true, name: true },
  });

  for (const r of restaurants) {
    const products = await prisma.product.findMany({
      where: { restaurantId: r.id, deletedAt: null },
      select: { id: true, name: true, unidadCompra: true, category: true },
      orderBy: { name: "asc" },
    });
    if (products.length === 0) continue;

    console.log(`\n── ${r.name}  (${products.length} productos) ──`);
    let dirty = 0;
    for (const p of products) {
      const parsed = parseIngredient(p.name);
      const isDirty = parsed.quantity !== null || parsed.unit !== null;
      if (isDirty) {
        dirty++;
        console.log(
          `  ⚠ "${p.name}"  →  parser sugiere: qty=${parsed.quantity}, unit=${parsed.unit}, name="${parsed.name}"  (unidadCompra actual: ${p.unidadCompra})`,
        );
      }
    }
    if (dirty === 0) {
      console.log(`  ✓ Todos limpios.`);
    } else {
      console.log(`\n  ${dirty}/${products.length} productos con cantidad/unidad pegada al nombre.`);
    }
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
