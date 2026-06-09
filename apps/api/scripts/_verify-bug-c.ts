// Verificación Bug C: matchear los 13 rawTexts de Gambero Rosso contra el
// banco. Esperado: 13 × exact.
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
import { findMatch, type MatchCandidate } from "../lib/products/matching";
import { parseIngredient } from "../lib/products/parser";

const RESTAURANT_ID = "cmp1gddcr00ce7k1g8dbybrx9";
const RECIPE_ID = "cmp2hzl85001k7knwjt4va11j";

async function main() {
  const [products, recipe] = await Promise.all([
    prisma.product.findMany({
      where: {
        restaurantId: RESTAURANT_ID,
        deletedAt: null,
        estado: { in: ["activo", "borrador"] },
      },
      select: { id: true, name: true, aliases: true },
    }),
    prisma.recipe.findUnique({
      where: { id: RECIPE_ID },
      select: {
        title: true,
        recipeIngredients: {
          orderBy: { position: "asc" },
          select: { rawText: true },
        },
      },
    }),
  ]);

  if (!recipe) {
    console.error("Recipe no encontrada");
    process.exit(1);
  }

  const candidates: MatchCandidate[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    aliases: p.aliases,
  }));

  console.log(`\n═══ Verificación Bug C ═══`);
  console.log(`Banco: ${candidates.length} candidatos`);
  console.log(`Receta: "${recipe.title}"\n`);

  // Replicar la lógica del endpoint /api/products/match POST-FIX.
  console.log(`──── Resultados (con parseIngredient pre-match) ────\n`);
  let exact = 0,
    probable = 0,
    none = 0;
  for (let i = 0; i < recipe.recipeIngredients.length; i++) {
    const rawText = recipe.recipeIngredients[i]!.rawText;
    const parsed = parseIngredient(rawText);
    const m = findMatch(parsed.name || rawText, candidates);
    const status =
      m.level === "exact" ? "✓ exact" : m.level === "probable" ? "~ probable" : "× none";
    if (m.level === "exact") exact++;
    else if (m.level === "probable") probable++;
    else none++;
    console.log(
      `  [${i.toString().padStart(2)}] ${status.padEnd(12)} (d=${m.distance})  "${rawText}"  →  ${m.productName ?? "(sin match)"}`,
    );
    console.log(
      `       parsed.name = "${parsed.name}"`,
    );
  }

  console.log(`\n──── Resumen ────`);
  console.log(`  exact:    ${exact}/13  ${exact === 13 ? "✓" : "✗"}`);
  console.log(`  probable: ${probable}/13`);
  console.log(`  none:     ${none}/13`);

  // Comparativa: cómo era ANTES del fix (sin parseIngredient).
  console.log(`\n──── Comparativa (sin parseIngredient — comportamiento PRE-fix) ────\n`);
  let exactPre = 0,
    probablePre = 0,
    nonePre = 0;
  for (let i = 0; i < recipe.recipeIngredients.length; i++) {
    const rawText = recipe.recipeIngredients[i]!.rawText;
    const m = findMatch(rawText, candidates);
    if (m.level === "exact") exactPre++;
    else if (m.level === "probable") probablePre++;
    else nonePre++;
  }
  console.log(`  exact:    ${exactPre}/13`);
  console.log(`  probable: ${probablePre}/13`);
  console.log(`  none:     ${nonePre}/13   ← estos eran los que se duplicaban`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
