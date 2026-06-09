// Verificación Bug A: simula el flujo "Modificar Gambero Rosso → guardar sin
// cambios" para comprobar que NO se dispara matching y NO se crean drafts.
//
// Replica fielmente la lógica de:
//   - openEditor en app/recetas/[id].tsx (post-fix)
//   - useEffect de carga del draft en app/recetas/nueva.tsx
//   - handleSave en app/recetas/nueva.tsx (filtro de toMatchIndices)
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

const RECIPE_ID = "cmp2hzl85001k7knwjt4va11j"; // Gambero Rosso

async function main() {
  // 1. Lo que verá el cliente cuando llame GET /api/recipes/[id].
  const recipe = await prisma.recipe.findUnique({
    where: { id: RECIPE_ID },
    select: {
      id: true,
      title: true,
      recipeIngredients: {
        orderBy: { position: "asc" },
        select: {
          rawText: true,
          product: { select: { id: true, name: true } },
        },
      },
    },
  });
  if (!recipe) {
    console.error("Recipe no encontrada");
    process.exit(1);
  }

  // 2. Simulamos openEditor (post-fix).
  type DraftIngredient = { rawText: string; productId: string | null };
  const draftRecipeIngredients: DraftIngredient[] = recipe.recipeIngredients.map(
    (ri) => ({
      rawText: ri.rawText,
      productId: ri.product?.id ?? null,
    }),
  );

  console.log(`\n═══ Simulación: Modificar "${recipe.title}" → guardar sin cambios ═══\n`);
  console.log(`Paso 1 — openEditor envía recipeIngredients al draft:`);
  console.log(`  ${draftRecipeIngredients.length} ingredientes preparados`);
  const withProductId = draftRecipeIngredients.filter((i) => i.productId !== null).length;
  console.log(`  Con productId resuelto: ${withProductId}/${draftRecipeIngredients.length}\n`);

  // 3. Simulamos el useEffect de nueva.tsx que carga el draft.
  //    La rama "draft.recipeIngredients && length > 0" mapea con productId.
  console.log(`Paso 2 — nueva.tsx inicializa los ingredientes:`);
  let ingredients: DraftIngredient[];
  if (draftRecipeIngredients.length > 0) {
    ingredients = draftRecipeIngredients.map((r) => ({
      rawText: r.rawText,
      productId: r.productId ?? null,
    }));
    console.log(`  Rama: from draft.recipeIngredients (la del fix)`);
  } else {
    // Fallback inalcanzable acá; placeholder solo para mostrar el camino.
    ingredients = [];
    console.log(`  Rama: fallback contentJson.ingredients (¡no debería entrar acá!)`);
  }

  // 4. Simulamos handleSave — filtro de los que NO tienen productId.
  console.log(`\nPaso 3 — handleSave filtra ingredientes sin productId:`);
  const working = ingredients
    .map((i) => ({ rawText: i.rawText.trim(), productId: i.productId }))
    .filter((i) => i.rawText.length > 0);
  const toMatchTexts: string[] = [];
  working.forEach((i) => {
    if (!i.productId) toMatchTexts.push(i.rawText);
  });

  console.log(`  Ingredientes para matchear: ${toMatchTexts.length}`);
  if (toMatchTexts.length === 0) {
    console.log(`  ✓ matchProducts NO se llamaría`);
    console.log(`  ✓ draftIndices estaría vacío`);
    console.log(`  ✓ createProduct NO se llamaría`);
    console.log(`  ✓ Banco NO se modificaría`);
  } else {
    console.log(`  ✗ matchProducts se llamaría con ${toMatchTexts.length} queries`);
    for (const t of toMatchTexts) console.log(`     - "${t}"`);
  }

  // 5. Estado actual del banco.
  const bankCount = await prisma.product.count({
    where: { restaurantId: "cmp1gddcr00ce7k1g8dbybrx9", deletedAt: null },
  });
  console.log(`\nPaso 4 — Banco actual: ${bankCount} productos (esperado pre-edit: 27)`);
  console.log(`         Banco esperado post-edit: ${bankCount} (sin cambios)`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
