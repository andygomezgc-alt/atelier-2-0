// Snapshot del estado del banco + recetas al cierre de Sub-paso A.5.
// Output usado para alimentar el documento project/A5-cierre.md.
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

const RESTAURANT_ID = "cmp1gddcr00ce7k1g8dbybrx9";

async function main() {
  const products = await prisma.product.findMany({
    where: { restaurantId: RESTAURANT_ID, deletedAt: null },
    select: {
      id: true,
      name: true,
      category: true,
      pezzaturaMode: true,
      pezzaturaMin: true,
      pezzaturaMax: true,
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  const recipes = await prisma.recipe.findMany({
    where: { restaurantId: RESTAURANT_ID, deletedAt: null },
    select: {
      id: true,
      title: true,
      portions: true,
      salePrice: true,
      recipeIngredients: {
        select: { id: true, productId: true, pesoCalculoG: true },
      },
    },
    orderBy: { title: "asc" },
  });

  // Productos por categoría.
  const byCat = new Map<string, number>();
  let withPezzatura = 0;
  for (const p of products) {
    byCat.set(p.category, (byCat.get(p.category) ?? 0) + 1);
    if (p.pezzaturaMode !== null) withPezzatura++;
  }

  console.log(`### Banco`);
  console.log(`Total productos activos:    ${products.length}`);
  console.log(`Con pezzatura cargada:      ${withPezzatura}`);
  console.log(`Sin pezzatura:              ${products.length - withPezzatura}`);
  console.log();
  console.log(`Por categoría:`);
  for (const [cat, n] of [...byCat.entries()].sort()) {
    console.log(`  ${cat.padEnd(16)} ${n}`);
  }
  console.log();
  console.log(`Productos con pezzatura cargada (estructurada):`);
  for (const p of products) {
    if (p.pezzaturaMode === null) continue;
    console.log(
      `  ${p.name.padEnd(50)} ${p.pezzaturaMode} ${p.pezzaturaMin?.toString()}/${p.pezzaturaMax?.toString()}`,
    );
  }
  console.log();

  console.log(`### Recetas`);
  console.log(`Total recetas activas:      ${recipes.length}`);
  let totalIng = 0;
  let withOverride = 0;
  let linked = 0;
  for (const r of recipes) {
    for (const ri of r.recipeIngredients) {
      totalIng++;
      if (ri.productId) linked++;
      if (ri.pesoCalculoG !== null) withOverride++;
    }
  }
  console.log(`Ingredientes totales:       ${totalIng}`);
  console.log(`Linked a producto del banco: ${linked} (${Math.round((linked / Math.max(totalIng, 1)) * 100)}%)`);
  console.log(`Con pesoCalculoG override:  ${withOverride}`);
  console.log();
  console.log(`Recetas con porciones y precio venta cargados:`);
  for (const r of recipes) {
    const p = r.portions ?? "—";
    const sp =
      r.salePrice !== null ? `€${(r.salePrice / 100).toFixed(2)}` : "—";
    console.log(`  ${r.title.padEnd(70)} portions=${p}  venta=${sp}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
