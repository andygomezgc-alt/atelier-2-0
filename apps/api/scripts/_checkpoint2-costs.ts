// Checkpoint #2 (Bloque 2 / Fase 5) — costos de Gambero Rosso y Ricciola
// in bianco con desglose per-ingrediente. Sirve para que Andy valide con
// ojo de chef si los números cuadran con su experiencia real.
//
// Lee de la DB directo (Prisma), arma el input del cost compute, y muestra
// el cost agregado + el costo de cada ingrediente individual (compute con
// array de 1 elemento por iteración — para reportes, no en hot path).
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
import type {
  PezzaturaMode,
  ProductUnit,
} from "@atelier/shared";

const RESTAURANT_ID = "cmp1gddcr00ce7k1g8dbybrx9";

function fmtEuro(cents: number | null): string {
  if (cents === null) return "—";
  const sign = cents < 0 ? "-" : "";
  return `${sign}€ ${(Math.abs(cents) / 100).toFixed(2)}`;
}

function fmtPct(pct: number | null): string {
  return pct === null ? "—" : `${pct} %`;
}

function buildIngredientForCost(row: {
  qty: { toString(): string } | null;
  unit: string | null;
  mermaOverridePct: { toString(): string } | null;
  pesoCalculoG: { toString(): string } | null;
  product:
    | {
        precioCompra: number;
        mermaPct: { toString(): string };
        unidadCompra: string;
        pezzaturaMode: string | null;
        pezzaturaMin: { toString(): string } | null;
        pezzaturaMax: { toString(): string } | null;
      }
    | null;
}): RecipeIngredientForCost {
  return {
    qty: row.qty ? Number(row.qty.toString()) : null,
    unit: row.unit,
    mermaOverridePct: row.mermaOverridePct
      ? Number(row.mermaOverridePct.toString())
      : null,
    pesoCalculoG: row.pesoCalculoG
      ? Number(row.pesoCalculoG.toString())
      : null,
    product: row.product
      ? {
          precioCompra: row.product.precioCompra,
          mermaPct: Number(row.product.mermaPct.toString()),
          unidadCompra: row.product.unidadCompra as ProductUnit,
          pezzaturaMode: row.product.pezzaturaMode as PezzaturaMode | null,
          pezzaturaMin: row.product.pezzaturaMin
            ? Number(row.product.pezzaturaMin.toString())
            : null,
          pezzaturaMax: row.product.pezzaturaMax
            ? Number(row.product.pezzaturaMax.toString())
            : null,
        }
      : null,
  };
}

type RecipeWithIngredients = Awaited<
  ReturnType<typeof prisma.recipe.findFirst>
>;

async function reportRecipe(titleContains: string): Promise<void> {
  const recipe = await prisma.recipe.findFirst({
    where: {
      restaurantId: RESTAURANT_ID,
      deletedAt: null,
      title: { contains: titleContains },
    },
    include: {
      recipeIngredients: {
        orderBy: { position: "asc" },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              precioCompra: true,
              mermaPct: true,
              unidadCompra: true,
              pezzaturaMode: true,
              pezzaturaMin: true,
              pezzaturaMax: true,
            },
          },
        },
      },
    },
  });
  if (!recipe) {
    console.log(`(receta no encontrada: "${titleContains}")\n`);
    return;
  }

  const ingredientsForCost = recipe.recipeIngredients.map(
    buildIngredientForCost,
  );

  // Cost agregado.
  const cost = computeRecipeCost({
    ingredients: ingredientsForCost,
    portions: recipe.portions,
    salePriceCents: recipe.salePrice,
  });

  console.log(`\n═══ ${recipe.title} ═══`);
  console.log(`Porciones:         ${recipe.portions ?? "1 (default)"}`);
  console.log(`Precio venta:      ${fmtEuro(recipe.salePrice)}`);
  console.log();
  console.log(`Costo total:       ${fmtEuro(cost.totalCents)}`);
  console.log(`Por porción:       ${fmtEuro(cost.perPortionCents)}`);
  console.log(`Food cost %:       ${fmtPct(cost.foodCostPct)}`);
  console.log();
  console.log(`Buckets:`);
  console.log(`  Computables:     ${cost.computableCount}/${cost.totalIngredients}`);
  console.log(`  Sin precio:      ${cost.missingPriceCount}`);
  console.log(`  No medibles:     ${cost.unmeasuredCount}`);
  console.log(`  No enlazados:    ${cost.unlinkedCount}`);
  console.log(`  Rango ancho:     ${cost.wideRangeCount}`);
  console.log();

  // Per-ingredient: corro cost compute con array de 1 por iteración.
  // Esto NO es lo que hace el server (el server expone solo el agregado),
  // pero para este reporte de validación me sirve.
  console.log(`Desglose por ingrediente:`);
  recipe.recipeIngredients.forEach((row, idx) => {
    const ing = ingredientsForCost[idx]!;
    const single = computeRecipeCost({
      ingredients: [ing],
      portions: 1,
      salePriceCents: null,
    });
    const reasonShort = single.totalCents === null
      ? single.unlinkedCount > 0
        ? "sin producto enlazado"
        : single.missingPriceCount > 0
        ? "sin precio"
        : "no medible"
      : null;
    const pezzInfo =
      row.product &&
      row.product.pezzaturaMode &&
      row.product.pezzaturaMin &&
      row.product.pezzaturaMax
        ? ` [pezzatura ${row.product.pezzaturaMode} ${row.product.pezzaturaMin.toString()}/${row.product.pezzaturaMax.toString()}]`
        : "";
    const wideWarn = single.wideRangeCount > 0 ? " ⚠ rango ancho" : "";
    console.log(
      `  ${row.position.toString().padStart(2)}. "${row.rawText}"`,
    );
    console.log(
      `       qty=${ing.qty ?? "—"} unit=${ing.unit ?? "—"} → "${row.product?.name ?? "(sin enlazar)"}"${pezzInfo}`,
    );
    if (reasonShort) {
      console.log(`       costo: — (${reasonShort})`);
    } else {
      console.log(`       costo: ${fmtEuro(single.totalCents)}${wideWarn}`);
    }
  });
}

async function main() {
  console.log(`═══ Checkpoint #2 — Cost validation ═══`);
  await reportRecipe("Gambero Rosso");
  await reportRecipe("Ricciola");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
