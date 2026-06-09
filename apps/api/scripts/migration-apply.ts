// Aplica la migración real (mode="apply") a un restaurantId pasado por arg.
// Uso:
//
//   cd apps/api
//   ../../packages/db/node_modules/.bin/tsx scripts/migration-apply.ts <restaurantId>
//
// Es la versión CLI del endpoint POST /api/products/migrate-recipes con
// actorId=null (acción admin, no hay user) — para casos donde aplicar desde
// la UI no es práctico (DB dev, restaurante específico sin sesión).
//
// SAFETY: NO acepta --force. Si una receta ya tiene RecipeIngredient rows,
// se skip. Si querés re-migrar una receta, usa el endpoint con `force: true`
// vía admin UI.

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
import { migrateRecipesForRestaurant } from "../lib/products/migrate";

async function main() {
  const restaurantId = process.argv[2];
  if (!restaurantId) {
    console.error("Falta arg: restaurantId");
    console.error("Uso: tsx scripts/migration-apply.ts <restaurantId>");
    process.exit(1);
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { id: true, name: true },
  });
  if (!restaurant) {
    console.error(`Restaurante ${restaurantId} no existe.`);
    process.exit(1);
  }

  console.log(`\nAplicando migración a "${restaurant.name}" (${restaurant.id})...\n`);

  const report = await migrateRecipesForRestaurant(restaurant.id, null, {
    mode: "apply",
    probableMatches: "leave-unmatched",
    force: false,
  });

  console.log("Resultado:");
  console.log(`  Recetas a migrar:    ${report.summary.recipesToMigrate}`);
  console.log(`  Recetas migradas:    ${report.result?.recipesMigrated ?? 0}`);
  console.log(`  Drafts creados:      ${report.result?.draftsCreated ?? 0}`);
  console.log(`  Errores:             ${report.result?.errors.length ?? 0}`);
  console.log("");
  console.log("Matches:");
  console.log(`  Exactos:    ${report.summary.matches.exact}`);
  console.log(`  Probables:  ${report.summary.matches.probable}  (sin link, queda para revisión)`);
  console.log(`  Nuevos:     ${report.summary.matches.none}  (drafts creados)`);

  if (report.result?.errors.length) {
    console.log("\nErrores:");
    for (const e of report.result.errors) {
      console.log(`  - ${e.recipeId}: ${e.error}`);
    }
  }

  if (report.result?.createdDraftIds.length) {
    console.log("\nDrafts creados (productIds — guarda para rollback si hace falta):");
    for (const id of report.result.createdDraftIds) console.log(`  - ${id}`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("ERROR fatal:", err);
  process.exit(1);
});
