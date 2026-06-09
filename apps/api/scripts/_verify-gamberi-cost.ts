// Verificación post-apply del fix Gamberi.
//
// Confirma:
//   1. El producto canónico tiene pezzatura 15/20 y el nombre nuevo.
//   2. La receta Gambero Rosso enlaza al canónico (productId).
//   3. Si simulamos el ingrediente como "4 gamberi" (unit=piezas) en vez
//      de "200g", el cost compute usa la pezzatura y devuelve ~€8 sin merma.
//
// No modifica la receta — solo simula el cambio en memoria para el cost.
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
import {
  computeRecipeCost,
  type RecipeIngredientForCost,
} from "../lib/products/cost";
import type { PezzaturaMode, ProductUnit } from "@atelier/shared";

const CANONICAL_ID = "cmp7gvyro00017ka0oyvpep1o";

async function main() {
  console.log(`\n═══ Verificación post-apply Gamberi ═══\n`);

  // 1. Producto canónico.
  const p = await prisma.product.findUnique({
    where: { id: CANONICAL_ID },
    select: {
      name: true, pezzaturaMode: true, pezzaturaMin: true, pezzaturaMax: true,
      precioCompra: true, mermaPct: true, unidadCompra: true, deletedAt: true,
    },
  });
  if (!p) throw new Error("Canonical no encontrado");
  console.log(`1. Producto canónico (cmp7gvyro...):`);
  console.log(`   name:           "${p.name}"`);
  console.log(`   pezzatura:      ${p.pezzaturaMode} ${p.pezzaturaMin?.toString()}/${p.pezzaturaMax?.toString()}`);
  console.log(`   precio:         € ${(p.precioCompra / 100).toFixed(2)}`);
  console.log(`   merma:          ${p.mermaPct.toString()}%`);
  console.log(`   unidadCompra:   ${p.unidadCompra}`);
  console.log(`   deletedAt:      ${p.deletedAt}`);
  console.log(`   ✓ pezzatura cargada: ${p.pezzaturaMode === "pz_per_kg" && Number(p.pezzaturaMin) === 15 && Number(p.pezzaturaMax) === 20 ? "SÍ" : "NO"}`);
  console.log();

  // 2. Receta Gambero Rosso enlaza al canónico.
  const recipe = await prisma.recipe.findFirst({
    where: { title: { contains: "Gambero Rosso" } },
    select: {
      id: true,
      title: true,
      recipeIngredients: {
        where: { rawText: { contains: "Gamberi" } },
        select: {
          rawText: true,
          qty: true,
          unit: true,
          productId: true,
          product: { select: { name: true } },
        },
      },
    },
  });
  console.log(`2. Receta enlaza al canónico:`);
  if (!recipe || recipe.recipeIngredients.length === 0) {
    console.log(`   ✗ Receta no encontrada o sin ingrediente Gamberi`);
  } else {
    for (const ri of recipe.recipeIngredients) {
      const linked = ri.productId === CANONICAL_ID;
      console.log(`   "${ri.rawText}" qty=${ri.qty?.toString() ?? "—"} unit=${ri.unit ?? "—"}`);
      console.log(`   productId: ${ri.productId} → "${ri.product?.name ?? "?"}"`);
      console.log(`   ${linked ? "✓" : "✗"} linked al canónico`);
    }
  }
  console.log();

  // 3. Simulación: cost compute con "4 gamberi" en piezas.
  console.log(`3. Cost simulado con "4 gamberi" en unit=piezas:`);
  const simIng: RecipeIngredientForCost = {
    qty: 4,
    unit: "piezas",
    mermaOverridePct: null,
    pesoCalculoG: null, // usa pezzatura del banco
    product: {
      precioCompra: p.precioCompra,
      mermaPct: Number(p.mermaPct.toString()),
      unidadCompra: p.unidadCompra as ProductUnit,
      pezzaturaMode: p.pezzaturaMode as PezzaturaMode | null,
      pezzaturaMin: p.pezzaturaMin ? Number(p.pezzaturaMin.toString()) : null,
      pezzaturaMax: p.pezzaturaMax ? Number(p.pezzaturaMax.toString()) : null,
    },
  };
  const cost = computeRecipeCost({
    ingredients: [simIng],
    portions: 1,
    salePriceCents: null,
  });
  console.log(`   Punto medio pezzatura:  (15+20)/2 = 17.5 pz/kg`);
  console.log(`   Peso por pieza:         1000/17.5 = ${(1000 / 17.5).toFixed(2)} g/pz`);
  console.log(`   Peso total (4 piezas):  4 × ${(1000 / 17.5).toFixed(2)} = ${(4000 / 17.5).toFixed(2)} g`);
  console.log(`   Precio €/kg:            € ${(p.precioCompra / 100).toFixed(2)}`);
  console.log(`   Costo sin merma:        ${(4000 / 17.5).toFixed(2)}g × €${(p.precioCompra / 100).toFixed(2)}/kg / 1000 = € ${((4000 / 17.5) * p.precioCompra / 100000).toFixed(2)}`);
  console.log();
  console.log(`   Cost compute resultado:`);
  console.log(`   totalCents:             ${cost.totalCents} (= € ${cost.totalCents !== null ? (cost.totalCents / 100).toFixed(2) : "—"})`);
  console.log(`   computableCount:        ${cost.computableCount}/${cost.totalIngredients}`);
  console.log(`   wideRangeCount:         ${cost.wideRangeCount}`);
  console.log();
  console.log(`   Andy esperaba ~€8.00. Result: ${cost.totalCents !== null && Math.abs(cost.totalCents - 800) < 20 ? "✓ MATCHEA" : "✗ NO MATCHEA"}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
