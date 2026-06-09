// Snapshot read-only post-migración. Para verificar que el banco quedó
// como esperábamos.
//
// Uso:
//   cd apps/api
//   ../../packages/db/node_modules/.bin/tsx scripts/dev-kitchen-snapshot.ts <restaurantId>

import { readFileSync } from "node:fs";
import { join } from "node:path";

(() => {
  const envPath = join(__dirname, "..", ".env.local");
  try {
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
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();

import { prisma } from "@atelier/db";

async function main() {
  const restaurantId = process.argv[2];
  if (!restaurantId) {
    console.error("Falta restaurantId");
    process.exit(1);
  }

  const products = await prisma.product.findMany({
    where: { restaurantId },
    select: {
      id: true,
      name: true,
      category: true,
      estado: true,
      precioCompra: true,
      unidadCompra: true,
      mermaPct: true,
      mermaOrigen: true,
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  const recipes = await prisma.recipe.findMany({
    where: { restaurantId, deletedAt: null },
    select: {
      id: true,
      title: true,
      recipeIngredients: {
        select: {
          productId: true,
          product: { select: { name: true, category: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  // Stats productos.
  const withPrice = products.filter((p) => p.precioCompra > 0).length;
  const drafts = products.filter((p) => p.estado === "borrador").length;
  const activos = products.filter((p) => p.estado === "activo").length;
  const archivados = products.filter((p) => p.estado === "archivado").length;
  const byCat = new Map<string, number>();
  for (const p of products) byCat.set(p.category, (byCat.get(p.category) ?? 0) + 1);

  console.log(`\n═══ Snapshot Dev Kitchen ═══\n`);
  console.log(`Banco:`);
  console.log(`  Total productos:        ${products.length}`);
  console.log(`  En estado borrador:     ${drafts}`);
  console.log(`  En estado activo:       ${activos}`);
  console.log(`  En estado archivado:    ${archivados}`);
  console.log(`  Con precio (>0):        ${withPrice}`);
  console.log(`  Sin precio (=0):        ${products.length - withPrice}`);
  console.log(`\nPor categoría:`);
  for (const [cat, count] of [...byCat.entries()].sort()) {
    console.log(`  ${cat.padEnd(16)} ${count}`);
  }

  console.log(`\nRecetas:`);
  for (const r of recipes) {
    const linkedCount = r.recipeIngredients.filter((ri) => ri.productId).length;
    const total = r.recipeIngredients.length;
    const status =
      total > 0
        ? `MIGRADA (${linkedCount}/${total} enlazados)`
        : "sin RecipeIngredient";
    console.log(`  ▸ "${r.title}"  [${status}]`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
