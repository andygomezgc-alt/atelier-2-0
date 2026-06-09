// Opción C — wipe del Dev Kitchen en transacción atómica.
//
// Pasos en una sola transacción:
//   1. Borrar RecipeIngredient rows de las 2 recetas migradas (resetea su
//      estado a "no migrada" — el contentJson queda intacto).
//   2. Borrar TODOS los productos del Dev Kitchen (28).
//   3. Insertar AuditLog con huella de la acción.
//
// Uso:
//   cd apps/api
//   ../../packages/db/node_modules/.bin/tsx scripts/dev-kitchen-wipe-option-c.ts --apply
//
// Sin --apply: simula, no toca DB.

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
    console.error("No pude leer apps/api/.env.local:", err);
    process.exit(1);
  }
})();

import { prisma } from "@atelier/db";

const RESTAURANT_ID = "cmp1gddcr00ce7k1g8dbybrx9"; // Dev Kitchen
const RECIPE_IDS_TO_RESET = [
  "cmp2hzl85001k7knwjt4va11j", // Gambero Rosso di Mazara...
  "cmp2i6znf001m7knw1ws4vf6m", // Ricciola in Bianco...
];

async function main() {
  const apply = process.argv.includes("--apply");

  // Preflight: cuántas rows tocará la transacción.
  const [recIngCount, productCount] = await Promise.all([
    prisma.recipeIngredient.count({
      where: { recipeId: { in: RECIPE_IDS_TO_RESET } },
    }),
    prisma.product.count({ where: { restaurantId: RESTAURANT_ID } }),
  ]);

  console.log(`\nPreflight:`);
  console.log(`  RecipeIngredient rows a borrar: ${recIngCount}`);
  console.log(`  Product rows a borrar:          ${productCount}`);
  console.log(`  Restaurante:                    ${RESTAURANT_ID}`);
  console.log(`  Recetas afectadas:              ${RECIPE_IDS_TO_RESET.join(", ")}`);

  if (!apply) {
    console.log(`\n(dry-run — no se ejecuta. Re-corré con --apply.)`);
    return;
  }

  console.log(`\nEjecutando transacción...`);
  const result = await prisma.$transaction(async (tx) => {
    // PASO 1
    const recIng = await tx.recipeIngredient.deleteMany({
      where: { recipeId: { in: RECIPE_IDS_TO_RESET } },
    });

    // PASO 2
    const products = await tx.product.deleteMany({
      where: { restaurantId: RESTAURANT_ID },
    });

    // PASO 3
    const audit = await tx.auditLog.create({
      data: {
        restaurantId: RESTAURANT_ID,
        actorId: null,
        action: "dev_kitchen_wipe",
        payload: {
          recipeIngredientsDeleted: recIng.count,
          productsDeleted: products.count,
          affectedRecipeIds: RECIPE_IDS_TO_RESET,
          executedAt: new Date().toISOString(),
          reason: "sub-paso 5: limpieza data chapucera pre-parser-nuevo",
        },
      },
    });

    return {
      recIngDeleted: recIng.count,
      productsDeleted: products.count,
      auditLogId: audit.id,
    };
  });

  console.log(`\nTransacción OK:`);
  console.log(`  Paso 1: RecipeIngredient borradas:  ${result.recIngDeleted}`);
  console.log(`  Paso 2: Product borrados:           ${result.productsDeleted}`);
  console.log(`  Paso 3: AuditLog creado:            ${result.auditLogId}`);

  // Verificación post-ejecución.
  console.log(`\nVerificación:`);
  const [pAfter, rAfter] = await Promise.all([
    prisma.product.count({ where: { restaurantId: RESTAURANT_ID } }),
    prisma.recipe.findMany({
      where: { restaurantId: RESTAURANT_ID, deletedAt: null },
      select: {
        id: true,
        title: true,
        contentJson: true,
        recipeIngredients: { select: { id: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  console.log(`  Productos en banco Dev Kitchen:  ${pAfter} (esperado: 0)`);
  console.log(`\n  Recetas del Dev Kitchen tras wipe:`);
  for (const r of rAfter) {
    const content = r.contentJson as { ingredients?: unknown };
    const ingCount = Array.isArray(content?.ingredients) ? content.ingredients.length : 0;
    const status =
      r.recipeIngredients.length > 0
        ? `MIGRADA (${r.recipeIngredients.length} rows)`
        : ingCount > 0
          ? `pendiente de migrar (${ingCount} ingredientes en contentJson)`
          : "sin ingredientes";
    console.log(`    - "${r.title}"  [${status}]`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("ERROR fatal:", err);
  process.exit(1);
});
