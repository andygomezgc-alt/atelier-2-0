// Restauración opción A1 (decisión Andy 2026-05-17):
//
//   1. Re-enlazar los 9 RecipeIngredient duplicados al producto limpio
//      equivalente del banco original (substring match).
//   2. Hard-delete los 9 productos chapuceros.
//   3. Restaurar RecipeIngredient[0] de Gambero Rosso:
//        rawText  "1 kg Gamberi..."  →  "16 Gamberi..."
//        qty      1                  →  16
//        unit     kg                 →  unidad
//   4. Restaurar contentJson.ingredients[0] de Gambero Rosso a "16 Gamberi..."
//      para mantener coherencia con RecipeIngredient.rawText.
//   5. AuditLog del restore.
//
// Uso:
//   ../../packages/db/node_modules/.bin/tsx scripts/restore-dev-kitchen-a1.ts [--apply]
//
// Sin --apply: dry-run que imprime el plan.

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

const RESTAURANT_ID = "cmp1gddcr00ce7k1g8dbybrx9"; // Dev Kitchen
const RECIPE_ID = "cmp2hzl85001k7knwjt4va11j"; // Gambero Rosso

// Los 9 chapuceros identificados por el diag previo.
const CHAPUCEROS_IDS = [
  "cmpa69opn006h7kxspgwjmdbw", // "1 kg Gamberi Rossi di Mazara del Vallo (Grado 1, abbattuti)"
  "cmpa69oqx006j7kxskh9i37fi", // "500g Pomodorini Gialli del Piennolo"
  "cmpa69orf006l7kxsn0lwr86h", // "20g Capperi di Pantelleria (sotto sale)"
  "cmpa69os8006n7kxssx4x4orr", // "50g Mandorla di Noto (pelata)"
  "cmpa69ovi006p7kxsledzwxqd", // "2 Zucchine baby con il loro Fiore"
  "cmpa69owm006r7kxsm3p9wfvh", // "1 mazzetto di Basilico Genovese DOP"
  "cmpa69ox6006t7kxsdvka1n1k", // "1 Scalogno"
  "cmpa69oy7006v7kxsljoipib0", // "1 Bergamotto di Reggio Calabria (non trattato)"
  "cmpa69oze006x7kxsznqaxx1s", // "30g Pane Carasau"
];

async function main() {
  const apply = process.argv.includes("--apply");

  // 1. Cargar los chapuceros (para mostrar) + todos los productos limpios
  //    para hacer matching.
  const [chapuceros, originals, recipe] = await Promise.all([
    prisma.product.findMany({
      where: { id: { in: CHAPUCEROS_IDS } },
      select: { id: true, name: true },
    }),
    prisma.product.findMany({
      where: {
        restaurantId: RESTAURANT_ID,
        deletedAt: null,
        id: { notIn: CHAPUCEROS_IDS },
      },
      select: { id: true, name: true },
    }),
    prisma.recipe.findUnique({
      where: { id: RECIPE_ID },
      select: {
        id: true,
        title: true,
        contentJson: true,
        recipeIngredients: {
          orderBy: { position: "asc" },
          select: {
            id: true,
            position: true,
            rawText: true,
            qty: true,
            unit: true,
            productId: true,
          },
        },
      },
    }),
  ]);

  if (!recipe) {
    console.error("Recipe Gambero Rosso no encontrada");
    process.exit(1);
  }

  // 2. Mapeo chapucero → limpio.
  //    Estrategia: para cada chapucero, busco entre originals un name que sea
  //    SUFIJO del name del chapucero (porque el chapucero es "{cant}{unit} {name}"
  //    o "{cant} {name}"). El que más larga la coincidencia gana.
  type Mapping = {
    chapuceroId: string;
    chapuceroName: string;
    cleanId: string;
    cleanName: string;
  };
  const mappings: Mapping[] = [];
  const unmatched: string[] = [];

  for (const c of chapuceros) {
    // Quita prefijo de cantidad+unit del name chapucero.
    const stripped = c.name.replace(
      /^\d+(?:[.,]\d+)?\s*(?:kg|g|l|ml|unidad|unidades|u|ud|uds|piez[a-z]*|mazzett[oi])?\s+(?:de|di|del|della|d')?\s*/i,
      "",
    );
    // Buscamos el limpio cuyo name === stripped (exacto) o el limpio cuyo name
    // sea sufijo del chapucero.
    let best: { id: string; name: string } | null = null;
    let bestLen = 0;
    for (const o of originals) {
      if (o.name === stripped || c.name.endsWith(o.name)) {
        if (o.name.length > bestLen) {
          best = o;
          bestLen = o.name.length;
        }
      }
    }
    if (best) {
      mappings.push({
        chapuceroId: c.id,
        chapuceroName: c.name,
        cleanId: best.id,
        cleanName: best.name,
      });
    } else {
      unmatched.push(`"${c.name}" (id=${c.id}) — sin match limpio`);
    }
  }

  console.log(`\n═══ PLAN A1 — Restauración Dev Kitchen ═══\n`);

  console.log(`Receta target: "${recipe.title}"  (${recipe.id})\n`);

  console.log(`──── Mapeo chapucero → limpio (${mappings.length}/${chapuceros.length}) ────\n`);
  for (const m of mappings) {
    console.log(`  "${m.chapuceroName}"`);
    console.log(`    ↓ re-link RecipeIngredient.productId`);
    console.log(`  "${m.cleanName}"  (${m.cleanId})`);
    console.log("");
  }
  if (unmatched.length > 0) {
    console.log(`⚠ Chapuceros sin match (NO se re-enlazarán; abortar si hay):\n`);
    for (const u of unmatched) console.log(`  ${u}`);
    console.log("");
  }

  // 3. Restauración del primer ingrediente.
  const first = recipe.recipeIngredients.find((ri) => ri.position === 0);
  if (!first) {
    console.error("RecipeIngredient position=0 no encontrado");
    process.exit(1);
  }
  const restoredRawText = "16 Gamberi Rossi di Mazara del Vallo (Grado 1, abbattuti)";
  console.log(`──── Restauración del ingrediente #1 ────\n`);
  console.log(`  RecipeIngredient ${first.id}`);
  console.log(`    rawText:  "${first.rawText}"  →  "${restoredRawText}"`);
  console.log(
    `    qty:      ${first.qty?.toString() ?? "null"}  →  16`,
  );
  console.log(`    unit:     ${first.unit ?? "null"}  →  unidad`);
  console.log("");

  // 4. Restauración contentJson.ingredients[0].
  const content = recipe.contentJson as { ingredients: string[]; method: string[]; notes: string };
  const newIngredients = [...content.ingredients];
  console.log(`──── Restauración contentJson.ingredients[0] ────\n`);
  console.log(`  "${newIngredients[0]}"`);
  console.log(`    ↓`);
  console.log(`  "${restoredRawText}"`);
  newIngredients[0] = restoredRawText;
  console.log("");

  // 5. Hard-delete chapuceros.
  console.log(`──── Hard-delete chapuceros (${mappings.length}) ────\n`);
  for (const m of mappings) {
    console.log(`  DELETE Product ${m.chapuceroId}  "${m.chapuceroName}"`);
  }
  console.log("");

  // 6. Audit log.
  console.log(`──── AuditLog ────\n`);
  console.log(
    `  CREATE action="dev_kitchen_restore_a1"  payload={mappings: ${mappings.length}, deleted: ${mappings.length}}`,
  );
  console.log("");

  console.log(`──── RESUMEN ────\n`);
  console.log(`  RecipeIngredient.update (re-link):    ${mappings.length}`);
  console.log(`  RecipeIngredient.update (restore #1): 1`);
  console.log(`  Recipe.update (contentJson):          1`);
  console.log(`  Product.delete:                       ${mappings.length}`);
  console.log(`  AuditLog.create:                      1`);
  console.log(`  Banco final esperado:                 ${chapuceros.length === mappings.length ? "27 productos" : "ABORT — hay unmatched"}`);

  if (!apply) {
    console.log(`\n(dry-run — nada ejecutado. Re-corré con --apply.)`);
    await prisma.$disconnect();
    return;
  }

  if (unmatched.length > 0) {
    console.error("\nABORT: hay chapuceros sin match limpio.");
    process.exit(1);
  }

  console.log(`\nEjecutando transacción atómica...`);
  await prisma.$transaction(async (tx) => {
    // PASO 1: re-link.
    for (const m of mappings) {
      await tx.recipeIngredient.updateMany({
        where: { productId: m.chapuceroId },
        data: { productId: m.cleanId },
      });
    }
    // PASO 2: restore RecipeIngredient #1.
    await tx.recipeIngredient.update({
      where: { id: first.id },
      data: {
        rawText: restoredRawText,
        qty: 16,
        unit: "unidad",
      },
    });
    // PASO 3: restore contentJson.
    await tx.recipe.update({
      where: { id: RECIPE_ID },
      data: {
        contentJson: {
          ingredients: newIngredients,
          method: content.method,
          notes: content.notes,
        },
      },
    });
    // PASO 4: delete chapuceros.
    await tx.product.deleteMany({
      where: { id: { in: CHAPUCEROS_IDS } },
    });
    // PASO 5: audit log.
    await tx.auditLog.create({
      data: {
        restaurantId: RESTAURANT_ID,
        actorId: null,
        action: "dev_kitchen_restore_a1",
        payload: {
          mappings: mappings.map((m) => ({
            chapucero: m.chapuceroName,
            clean: m.cleanName,
          })),
          deletedProductIds: CHAPUCEROS_IDS,
          restoredIngredient: {
            id: first.id,
            from: { rawText: first.rawText, qty: first.qty?.toString() ?? null, unit: first.unit },
            to: { rawText: restoredRawText, qty: 16, unit: "unidad" },
          },
          executedAt: new Date().toISOString(),
          reason: "Restauración manual tras detectar duplicación por bugs A/B/C del editor de recetas",
        },
      },
    });
  });

  console.log(`Transacción OK.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
