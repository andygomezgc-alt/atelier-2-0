// Preflight read-only — muestra:
//   - contentJson de las 2 recetas migradas (para confirmar que el original
//     se preserva → re-migración posible después del wipe).
//   - contentJson de las 4 recetas "vacías" sin ingredientes (para que Andy
//     decida cuáles borrar manualmente desde la app).
//
// Uso:
//   cd apps/api
//   ../../packages/db/node_modules/.bin/tsx scripts/dev-kitchen-preflight.ts <restaurantId>

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

function preview(value: unknown, max = 800): string {
  const s = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  if (s.length <= max) return s;
  return s.slice(0, max) + `... [truncado, ${s.length - max} chars más]`;
}

async function main() {
  const restaurantId = process.argv[2];
  if (!restaurantId) {
    console.error("Falta restaurantId");
    process.exit(1);
  }

  const recipes = await prisma.recipe.findMany({
    where: { restaurantId, deletedAt: null },
    select: {
      id: true,
      title: true,
      contentJson: true,
      createdAt: true,
      updatedAt: true,
      recipeIngredients: { select: { id: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  for (const r of recipes) {
    const status = r.recipeIngredients.length > 0
      ? `MIGRADA (${r.recipeIngredients.length} RecipeIngredient rows)`
      : "no migrada / vacía";
    console.log(`\n${"═".repeat(80)}`);
    console.log(`▸ "${r.title}"`);
    console.log(`  id:     ${r.id}`);
    console.log(`  status: ${status}`);
    console.log(`  created: ${r.createdAt.toISOString()}`);
    console.log(`  updated: ${r.updatedAt.toISOString()}`);

    const content = r.contentJson as Record<string, unknown> | null;
    if (!content) {
      console.log(`  contentJson: (null)`);
      continue;
    }

    const ings = (content as { ingredients?: unknown }).ingredients;
    console.log(`  contentJson.ingredients: ${
      Array.isArray(ings) ? `${ings.length} items` : "(no array)"
    }`);
    if (Array.isArray(ings) && ings.length > 0) {
      for (const i of ings) console.log(`     - ${typeof i === "string" ? i : JSON.stringify(i)}`);
    }

    // Resto del contentJson (excluyendo ingredients, que ya mostramos).
    const rest: Record<string, unknown> = { ...content };
    delete rest["ingredients"];
    const restKeys = Object.keys(rest);
    if (restKeys.length === 0) {
      console.log(`  contentJson otros campos: (ninguno)`);
    } else {
      console.log(`  contentJson otros campos: ${restKeys.join(", ")}`);
      for (const k of restKeys) {
        console.log(`     ${k}: ${preview(rest[k], 600)}`);
      }
    }
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});
