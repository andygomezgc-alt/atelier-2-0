// Backfill: re-parsea el rawText de cada RecipeIngredient con qty=null y
// graba qty + unit detectados. NO toca productos, NO crea/borra rows.
// Solo UPDATE en las filas existentes.
//
// Uso:
//   cd apps/api
//   ../../packages/db/node_modules/.bin/tsx scripts/backfill-recipe-ingredient-qty.ts [--apply]
//
// Sin --apply: dry-run, imprime qué UPDATE haría.

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
  const apply = process.argv.includes("--apply");

  // Sólo las filas que tienen qty=null. Si una fila ya tiene qty=12, asumimos
  // que alguien la setteó manualmente y no la pisamos.
  const rows = await prisma.recipeIngredient.findMany({
    where: { qty: null },
    select: {
      id: true,
      rawText: true,
      qty: true,
      unit: true,
      recipe: {
        select: {
          id: true,
          title: true,
          restaurant: { select: { name: true } },
        },
      },
    },
    orderBy: [{ recipeId: "asc" }, { position: "asc" }],
  });

  console.log(`\nRecipeIngredient rows con qty=null: ${rows.length}\n`);

  let willUpdate = 0;
  let unchanged = 0; // parser no detectó nada → row queda con qty/unit null
  let lastRecipe = "";

  type Plan = {
    id: string;
    rawText: string;
    qty: number;
    unit: string;
  };
  const plan: Plan[] = [];

  for (const r of rows) {
    if (r.recipe.id !== lastRecipe) {
      console.log(
        `\n  ▸ "${r.recipe.title}"  [${r.recipe.restaurant.name}]`,
      );
      lastRecipe = r.recipe.id;
    }
    const parsed = parseIngredient(r.rawText);
    if (parsed.quantity !== null && parsed.unit !== null) {
      willUpdate++;
      plan.push({
        id: r.id,
        rawText: r.rawText,
        qty: parsed.quantity,
        unit: parsed.unit,
      });
      console.log(
        `    UPDATE  qty=${parsed.quantity}  unit=${parsed.unit}  ←  "${r.rawText}"`,
      );
    } else {
      unchanged++;
      console.log(`    (skip)  no parseable                      ←  "${r.rawText}"`);
    }
  }

  console.log(`\nResumen:`);
  console.log(`  Rows que se UPDATE-arían:        ${willUpdate}`);
  console.log(`  Rows que quedan sin tocar:       ${unchanged}  (rawText no parseable)`);
  console.log(`  Total revisados:                 ${rows.length}`);

  if (!apply) {
    console.log(`\n(dry-run — ningún UPDATE ejecutado. Re-corré con --apply.)`);
    await prisma.$disconnect();
    return;
  }

  // Apply: UPDATE en transacción única. Si una falla, ninguna se aplica.
  console.log(`\nEjecutando ${plan.length} UPDATEs...`);
  await prisma.$transaction(
    plan.map((p) =>
      prisma.recipeIngredient.update({
        where: { id: p.id },
        data: { qty: p.qty, unit: p.unit },
      }),
    ),
  );
  console.log(`UPDATE OK.`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
