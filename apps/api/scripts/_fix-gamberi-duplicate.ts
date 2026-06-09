// Fix: duplicado de Gamberi creado al editar la receta de Gambero Rosso.
//
// Causa raíz (a revisar post-A.5): el flow de save de receta usa matching
// fuzzy con threshold Levenshtein ≤3. Cuando el chef acortó el rawText de
// "Gamberi Rossi di Mazara del Vallo (Grado 1, abbattui)" a "Gamberi Rossi
// di Mazara", la distancia superó el threshold → se creó un draft nuevo.
//
// Plan Opción A (aprobado por Andy):
//   1. Re-enlazar RecipeIngredients que apuntan al duplicado → al canónico.
//   2. Renombrar el canónico a "Gamberi Rossi di Mazara del Vallo"
//      (saca "Grado 1, abbattui" porque son metadatos del lote, no del
//      producto; mantiene "del Vallo" como denominación geográfica).
//   3. Soft-delete el duplicado.
//
// Uso:
//   tsx scripts/_fix-gamberi-duplicate.ts          (dry-run; default)
//   tsx scripts/_fix-gamberi-duplicate.ts --apply  (escribe a DB)
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
const CANONICAL_ID = "cmp7gvyro00017ka0oyvpep1o"; // viejo, con pezzatura 15/20
const DUPLICATE_ID = "cmpbkzc3v001a7kfwi267do8f"; // nuevo, sin pezzatura
const NEW_NAME = "Gamberi Rossi di Mazara del Vallo";
const APPLY = process.argv.includes("--apply");

async function main() {
  console.log(`\n═══ Fix duplicación Gamberi — Opción A ═══`);
  console.log(`Modo: ${APPLY ? "APPLY (escribe a DB)" : "DRY-RUN (no toca DB)"}\n`);

  const canonical = await prisma.product.findUnique({
    where: { id: CANONICAL_ID },
    select: {
      id: true, name: true, pezzaturaMode: true, pezzaturaMin: true,
      pezzaturaMax: true, precioCompra: true, mermaPct: true, estado: true,
    },
  });
  const duplicate = await prisma.product.findUnique({
    where: { id: DUPLICATE_ID },
    select: {
      id: true, name: true, pezzaturaMode: true, deletedAt: true,
      precioCompra: true, estado: true,
    },
  });

  if (!canonical) {
    console.error(`Canonical ${CANONICAL_ID} no existe.`);
    process.exit(1);
  }
  if (!duplicate) {
    console.error(`Duplicate ${DUPLICATE_ID} no existe.`);
    process.exit(1);
  }
  if (duplicate.deletedAt !== null) {
    console.log(`Duplicate ya está soft-deleted. Nada para hacer.`);
    await prisma.$disconnect();
    return;
  }

  console.log(`── Producto canónico (se mantiene) ──`);
  console.log(`  id:           ${canonical.id}`);
  console.log(`  name actual:  "${canonical.name}"`);
  console.log(`  name nuevo:   "${NEW_NAME}"`);
  console.log(`  pezzatura:    ${canonical.pezzaturaMode} ${canonical.pezzaturaMin?.toString()}/${canonical.pezzaturaMax?.toString()}`);
  console.log(`  precio:       € ${(canonical.precioCompra / 100).toFixed(2)}`);
  console.log(`  estado:       ${canonical.estado}`);
  console.log();

  console.log(`── Producto duplicado (se borra soft) ──`);
  console.log(`  id:           ${duplicate.id}`);
  console.log(`  name:         "${duplicate.name}"`);
  console.log(`  precio:       € ${(duplicate.precioCompra / 100).toFixed(2)}`);
  console.log(`  estado:       ${duplicate.estado}`);
  console.log();

  // Cuántos RecipeIngredients apuntan al duplicado.
  const linked = await prisma.recipeIngredient.findMany({
    where: { productId: DUPLICATE_ID, recipe: { deletedAt: null } },
    select: {
      id: true,
      rawText: true,
      qty: true,
      unit: true,
      recipe: { select: { id: true, title: true } },
    },
  });

  console.log(`── RecipeIngredients enlazados al duplicado (se re-enlazan al canónico) ──`);
  console.log(`  ${linked.length} fila(s):`);
  for (const ri of linked) {
    console.log(
      `  • receta "${ri.recipe.title}" — "${ri.rawText}" (qty=${ri.qty?.toString() ?? "—"} unit=${ri.unit ?? "—"})`,
    );
  }
  console.log();

  console.log(`── Plan de aplicación ──`);
  console.log(`  1. UPDATE RecipeIngredient SET productId='${CANONICAL_ID}' WHERE productId='${DUPLICATE_ID}'`);
  console.log(`     → ${linked.length} fila(s) afectadas`);
  console.log(`  2. UPDATE Product SET name='${NEW_NAME}' WHERE id='${CANONICAL_ID}'`);
  console.log(`  3. UPDATE Product SET deletedAt=NOW() WHERE id='${DUPLICATE_ID}'  (soft delete)`);
  console.log(`  4. INSERT AuditLog 3 entries: product_recategorized + product_renamed + product_soft_deleted`);
  console.log();

  if (!APPLY) {
    console.log(`Para aplicar:  tsx scripts/_fix-gamberi-duplicate.ts --apply`);
    await prisma.$disconnect();
    return;
  }

  console.log(`Aplicando…`);
  await prisma.$transaction(async (tx) => {
    // 1. Re-enlazar.
    const relinkResult = await tx.recipeIngredient.updateMany({
      where: { productId: DUPLICATE_ID },
      data: { productId: CANONICAL_ID },
    });
    console.log(`  ✓ ${relinkResult.count} ingredients re-linked`);

    // 2. Renombrar canónico.
    await tx.product.update({
      where: { id: CANONICAL_ID },
      data: { name: NEW_NAME },
    });
    console.log(`  ✓ Canonical renamed`);

    // 3. Soft-delete duplicado.
    await tx.product.update({
      where: { id: DUPLICATE_ID },
      data: { deletedAt: new Date() },
    });
    console.log(`  ✓ Duplicate soft-deleted`);

    // 4. AuditLogs.
    await tx.auditLog.createMany({
      data: [
        {
          restaurantId: RESTAURANT_ID,
          actorId: null,
          action: "recipe_ingredients_relinked",
          targetType: "Product",
          targetId: CANONICAL_ID,
          payload: {
            fromProductId: DUPLICATE_ID,
            toProductId: CANONICAL_ID,
            count: relinkResult.count,
            reason: "Opción A: consolidar duplicado de Gamberi creado por matching fuzzy estricto.",
          },
        },
        {
          restaurantId: RESTAURANT_ID,
          actorId: null,
          action: "product_renamed",
          targetType: "Product",
          targetId: CANONICAL_ID,
          payload: {
            fromName: canonical.name,
            toName: NEW_NAME,
            reason: "Saca 'Grado 1, abbattui' (metadatos del lote). Mantiene 'del Vallo' (denominación geográfica).",
          },
        },
        {
          restaurantId: RESTAURANT_ID,
          actorId: null,
          action: "product_soft_deleted",
          targetType: "Product",
          targetId: DUPLICATE_ID,
          payload: {
            name: duplicate.name,
            reason: "Duplicado consolidado en " + CANONICAL_ID,
          },
        },
      ],
    });
    console.log(`  ✓ 3 AuditLog entries`);
  });

  console.log(`\n✓ Aplicado.\n`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
