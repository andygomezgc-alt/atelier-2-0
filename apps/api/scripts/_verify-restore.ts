// Verificación post-restauración A1.
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
const RECIPE_ID = "cmp2hzl85001k7knwjt4va11j";

async function main() {
  const productCount = await prisma.product.count({
    where: { restaurantId: RESTAURANT_ID, deletedAt: null },
  });
  const recipe = await prisma.recipe.findUnique({
    where: { id: RECIPE_ID },
    select: {
      title: true,
      contentJson: true,
      recipeIngredients: {
        orderBy: { position: "asc" },
        select: {
          position: true,
          rawText: true,
          qty: true,
          unit: true,
          productId: true,
          product: { select: { name: true } },
        },
      },
    },
  });

  console.log(`\n═══ Verificación post-restauración ═══\n`);
  console.log(`Banco Dev Kitchen: ${productCount} productos`);
  console.log(`Esperado: 27  →  ${productCount === 27 ? "✓ OK" : "✗ MISMATCH"}\n`);

  if (recipe) {
    const content = recipe.contentJson as { ingredients: string[] };
    console.log(`Receta: "${recipe.title}"`);
    console.log(`  RecipeIngredient rows: ${recipe.recipeIngredients.length}  →  ${recipe.recipeIngredients.length === 13 ? "✓ OK (13)" : "✗"}`);
    const withProduct = recipe.recipeIngredients.filter((ri) => ri.productId !== null).length;
    console.log(`  Con productId enlazado: ${withProduct}/${recipe.recipeIngredients.length}\n`);

    console.log(`  Ingredientes:`);
    for (const ri of recipe.recipeIngredients) {
      const qty = ri.qty?.toString() ?? "null";
      console.log(
        `    [${ri.position.toString().padStart(2)}] qty=${qty.padStart(4)} unit=${(ri.unit ?? "null").padEnd(7)}  "${ri.rawText}"  →  ${ri.product?.name ?? "(null)"}`,
      );
    }

    console.log(`\n  contentJson.ingredients[0]: "${content.ingredients[0]}"`);
    console.log(
      `  Esperado: "16 Gamberi Rossi di Mazara del Vallo (Grado 1, abbattuti)"  →  ${
        content.ingredients[0] === "16 Gamberi Rossi di Mazara del Vallo (Grado 1, abbattuti)"
          ? "✓ OK"
          : "✗ MISMATCH"
      }`,
    );
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
