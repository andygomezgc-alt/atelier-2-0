// Wipe del banco de productos del restaurante Dev Kitchen.
//
// Uso:
//   cd apps/api
//   ../../packages/db/node_modules/.bin/tsx scripts/dev-kitchen-wipe.ts <restaurantId> [--apply]
//
// Sin --apply: dry-run, solo lista qué se borraría.
// Con --apply: ejecuta el borrado de verdad.
//
// SAFETY:
//   - Hard delete (no soft) — products.deletedAt no se usa porque queremos
//     el banco realmente vacío para empezar limpio.
//   - Falla en seco si alguno está enlazado a RecipeIngredient (FK protege).
//     Si pasa: hay recetas migradas que enlazaban a este producto → el chef
//     decide si purga también esas recetas o no toca el producto.
//   - Solo opera sobre el restaurantId pasado por arg — no toca otros
//     restaurantes. Doble check por nombre antes de ejecutar.
//   - AuditLog se graba con action="dev_kitchen_wipe" para tener huella.

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
  const apply = process.argv.includes("--apply");

  if (!restaurantId) {
    console.error("Falta arg: restaurantId");
    console.error("Uso: tsx scripts/dev-kitchen-wipe.ts <restaurantId> [--apply]");
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

  const products = await prisma.product.findMany({
    where: { restaurantId },
    select: { id: true, name: true, estado: true, category: true },
    orderBy: { name: "asc" },
  });

  if (products.length === 0) {
    console.log(`Banco de "${restaurant.name}" ya está vacío.`);
    return;
  }

  // Chequeo de FK: si alguno está enlazado a RecipeIngredient, fallaría.
  const linkedRows = await prisma.recipeIngredient.findMany({
    where: { productId: { in: products.map((p) => p.id) } },
    select: { productId: true, recipeId: true },
  });
  const blockedIds = new Set(linkedRows.map((r) => r.productId).filter(Boolean));

  console.log(`\nRestaurante: ${restaurant.name}  (${restaurant.id})`);
  console.log(`Productos a borrar: ${products.length}\n`);

  for (const p of products) {
    const blocked = blockedIds.has(p.id) ? "  [BLOQUEADO por FK]" : "";
    console.log(`  - [${p.estado}] ${p.category} :: ${p.name}${blocked}`);
  }

  if (blockedIds.size > 0) {
    console.log(
      `\n⚠ ${blockedIds.size} producto(s) están enlazados a recetas. ` +
        `Esos no se podrán borrar a menos que purgues también las recetas.\n`,
    );
  }

  if (!apply) {
    console.log("\n(dry-run — no se borró nada. Re-corré con --apply para ejecutar)");
    return;
  }

  // Apply: borrado real, en transacción.
  console.log("\nEjecutando borrado...");
  const result = await prisma.$transaction(async (tx) => {
    let deleted = 0;
    const errors: Array<{ id: string; name: string; error: string }> = [];
    for (const p of products) {
      try {
        await tx.product.delete({ where: { id: p.id } });
        deleted++;
      } catch (err) {
        errors.push({
          id: p.id,
          name: p.name,
          error: err instanceof Error ? err.message : "unknown",
        });
      }
    }
    await tx.auditLog.create({
      data: {
        restaurantId,
        actorId: null,
        action: "dev_kitchen_wipe",
        payload: {
          totalAttempted: products.length,
          deleted,
          errors,
        },
      },
    });
    return { deleted, errors };
  });

  console.log(`\nBorrado: ${result.deleted}/${products.length} productos.`);
  if (result.errors.length > 0) {
    console.log("\nErrores:");
    for (const e of result.errors) {
      console.log(`  - ${e.name} (${e.id}): ${e.error}`);
    }
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("ERROR fatal:", err);
  process.exit(1);
});
