// Diagnóstico: muestra qué recetas tienen RecipeIngredient rows que bloquean
// el wipe del Dev Kitchen.
//
// Uso:
//   cd apps/api
//   ../../packages/db/node_modules/.bin/tsx scripts/dev-kitchen-inspect.ts <restaurantId>

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

async function main() {
  const restaurantId = process.argv[2];
  if (!restaurantId) {
    console.error("Falta arg: restaurantId");
    process.exit(1);
  }

  const recipes = await prisma.recipe.findMany({
    where: { restaurantId, deletedAt: null },
    select: {
      id: true,
      title: true,
      recipeIngredients: {
        select: {
          id: true,
          position: true,
          rawText: true,
          productId: true,
          product: { select: { name: true } },
        },
        orderBy: { position: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`\nRestaurante: ${restaurantId}`);
  console.log(`Recetas: ${recipes.length}\n`);

  for (const r of recipes) {
    const status = r.recipeIngredients.length > 0 ? "MIGRADA" : "sin ingredientes";
    console.log(`  ▸ "${r.title}"  [${status}]  (${r.id})`);
    for (const ri of r.recipeIngredients) {
      console.log(
        `      ${ri.position}. "${ri.rawText}"  →  ${ri.product?.name ?? "(sin link)"}  [${ri.productId ?? "null"}]`,
      );
    }
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});
