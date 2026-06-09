// Diagnóstico de cálculo de cost para una receta específica. Muestra cada
// ingrediente con qué bucket cae (computable / sin-precio / sin-cantidad /
// sin-producto) y cuánto suma al total.
//
// Uso:
//   ../../packages/db/node_modules/.bin/tsx scripts/_diag-recipe-cost.ts <recipeId>

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
import { recipeDetailInclude, projectRecipeDetail } from "../lib/projections";
import { convertUnit, realCost } from "../lib/products/cost";
import type { ProductUnit } from "@atelier/shared";

async function main() {
  const recipeId = process.argv[2];
  if (!recipeId) {
    console.error("Falta recipeId");
    process.exit(1);
  }

  const recipe = await prisma.recipe.findUnique({
    where: { id: recipeId },
    include: recipeDetailInclude,
  });
  if (!recipe) {
    console.error(`Recipe ${recipeId} no existe`);
    process.exit(1);
  }

  console.log(`\n═══ Receta: ${recipe.title}  (${recipe.id}) ═══\n`);
  console.log(`portions: ${recipe.portions ?? "(null → 1)"}`);
  console.log(`salePrice: ${recipe.salePrice !== null ? `${(recipe.salePrice / 100).toFixed(2)} €` : "(null)"}`);
  console.log(`\nIngredientes (${recipe.recipeIngredients.length}):\n`);

  let total = 0;
  let computable = 0;
  let missingPrice = 0;
  let unmeasured = 0;
  let unlinked = 0;

  for (const ri of recipe.recipeIngredients) {
    const qty = ri.qty ? Number(ri.qty.toString()) : null;
    const unit = ri.unit;
    const merma = ri.mermaOverridePct
      ? Number(ri.mermaOverridePct.toString())
      : ri.product
        ? Number(ri.product.mermaPct.toString())
        : null;
    const precio = ri.product?.precioCompra ?? null;
    const unidadCompra = (ri.product?.unidadCompra ?? null) as ProductUnit | null;
    const productName = ri.product?.name ?? "(sin link)";

    console.log(`  ▸ "${ri.rawText}"`);
    console.log(`    producto: ${productName}`);
    console.log(`    receta:   qty=${qty} unit=${unit}`);
    console.log(`    banco:    precio=${precio !== null ? (precio / 100).toFixed(2) + " €" : "null"}  merma=${merma}%  unidadCompra=${unidadCompra}`);

    // Replicar la lógica de computeRecipeCost paso a paso.
    if (!ri.product) {
      unlinked++;
      console.log(`    → BUCKET: unlinked (productId=null)`);
      console.log("");
      continue;
    }
    if ((precio ?? 0) <= 0) {
      missingPrice++;
      console.log(`    → BUCKET: missingPrice (precioCompra <= 0)`);
      console.log("");
      continue;
    }
    if (qty === null || qty <= 0 || !unit) {
      unmeasured++;
      console.log(`    → BUCKET: unmeasured (qty=${qty} unit=${unit})`);
      console.log("");
      continue;
    }
    const recipeUnit = unit as ProductUnit;
    const factor = convertUnit(qty, recipeUnit, unidadCompra!);
    if (factor === null) {
      unmeasured++;
      console.log(`    → BUCKET: unmeasured  (conversión ${recipeUnit}→${unidadCompra} = imposible)`);
      console.log("");
      continue;
    }
    const real = realCost(precio!, merma!);
    const ingCost = real * factor;
    total += ingCost;
    computable++;
    console.log(`    → COMPUTABLE: ${factor} ${unidadCompra} × ${(real / 100).toFixed(2)} €/${unidadCompra} = ${(ingCost / 100).toFixed(2)} €`);
    console.log("");
  }

  console.log(`─── Totales ───`);
  console.log(`  computable:    ${computable}`);
  console.log(`  missingPrice:  ${missingPrice}`);
  console.log(`  unmeasured:    ${unmeasured}`);
  console.log(`  unlinked:      ${unlinked}`);
  console.log(`  TOTAL:         ${(total / 100).toFixed(2)} €`);
  console.log(`  Sum 3 buckets: ${missingPrice + unmeasured + unlinked}  (= "X ingredientes sin costo")`);

  // Doble-check: lo que devolvería projectRecipeDetail.
  const projected = projectRecipeDetail(recipe);
  console.log(`\n─── projectRecipeDetail().cost (lo que ve el cliente) ───`);
  console.log(JSON.stringify(projected.cost, null, 2));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
