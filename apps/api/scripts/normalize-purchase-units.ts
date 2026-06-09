// Normaliza Product.category + Product.unidadCompra usando los helpers:
//   - categorizeFromName(name) → para productos en "otro" que ahora encajan
//     en una categoría concreta gracias a keywords nuevos del categorizer.
//   - defaultPurchaseUnit(category, name) → para asignar kg/l/unidad
//     coherente con la categoría final.
//
// Uso:
//   cd apps/api
//   ../../packages/db/node_modules/.bin/tsx scripts/normalize-purchase-units.ts [--apply]
//
// SAFETY:
//   - Recategoriza SOLO productos cuya categoría actual es "otro" (no piso
//     decisiones manuales del chef que sí escogió pescado/carne/etc).
//   - No toca productos archivados ni soft-deleted.
//   - Excluye productos con precioCompra > 0 (cambiar unidad cambia el
//     significado del precio; el chef revisa esos manualmente).
//   - Idempotente: si la categoría/unidad ya coincide con lo propuesto,
//     skip.

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
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
})();

import { prisma } from "@atelier/db";
import { categorizeFromName } from "../lib/products/defaults";
import { defaultPurchaseUnit } from "../lib/products/purchase-unit";
import type { ProductCategory, ProductUnit } from "@atelier/shared";

async function main() {
  const apply = process.argv.includes("--apply");

  const products = await prisma.product.findMany({
    where: { deletedAt: null, estado: { in: ["activo", "borrador"] } },
    select: {
      id: true,
      name: true,
      category: true,
      unidadCompra: true,
      precioCompra: true,
      restaurant: { select: { name: true } },
    },
    orderBy: [{ restaurantId: "asc" }, { name: "asc" }],
  });

  type Plan = {
    id: string;
    name: string;
    fromCategory: string;
    toCategory: string;
    catChanged: boolean;
    fromUnit: string;
    toUnit: string;
    unitChanged: boolean;
    restaurantName: string;
  };
  const updates: Plan[] = [];
  const noChange: Array<{ name: string; restaurantName: string }> = [];
  const skipsPriced: Array<{
    name: string;
    currentUnit: string;
    proposedUnit: string;
    currentCategory: string;
    proposedCategory: string;
    precio: number;
    restaurantName: string;
  }> = [];

  for (const p of products) {
    // 1. Recategorizar solo si la categoría actual es "otro" y el nuevo
    //    categorizer puede inferir algo mejor.
    let proposedCategory: ProductCategory = p.category as ProductCategory;
    if (p.category === "otro") {
      const inferred = categorizeFromName(p.name);
      if (inferred !== "otro") proposedCategory = inferred;
    }
    const catChanged = proposedCategory !== p.category;

    // 2. Calcular unidad basada en la categoría propuesta.
    const proposedUnit = defaultPurchaseUnit(proposedCategory, p.name);
    const unitChanged = proposedUnit !== p.unidadCompra;

    if (!catChanged && !unitChanged) {
      noChange.push({ name: p.name, restaurantName: p.restaurant.name });
      continue;
    }
    if (p.precioCompra > 0) {
      skipsPriced.push({
        name: p.name,
        currentUnit: p.unidadCompra,
        proposedUnit,
        currentCategory: p.category,
        proposedCategory,
        precio: p.precioCompra,
        restaurantName: p.restaurant.name,
      });
      continue;
    }
    updates.push({
      id: p.id,
      name: p.name,
      fromCategory: p.category,
      toCategory: proposedCategory,
      catChanged,
      fromUnit: p.unidadCompra,
      toUnit: proposedUnit,
      unitChanged,
      restaurantName: p.restaurant.name,
    });
  }

  console.log(`\nTotal productos revisados:    ${products.length}`);
  console.log(`  Sin cambios necesarios:      ${noChange.length}`);
  console.log(`  Se UPDATE-arían:             ${updates.length}`);
  console.log(`  Se omiten (con precio):      ${skipsPriced.length}`);

  if (updates.length > 0) {
    console.log(`\nUPDATE plan (Δ=cambia, ·=igual):`);
    console.log(
      `  ${"Δcat".padEnd(5)} ${"cat actual".padEnd(15)} → ${"cat propuesta".padEnd(15)}   ${"Δuni".padEnd(5)} ${"unid".padEnd(7)} → ${"unid".padEnd(7)}  NOMBRE`,
    );
    console.log(`  ${"─".repeat(110)}`);
    let last = "";
    for (const u of updates) {
      if (u.restaurantName !== last) {
        console.log(`\n  ── ${u.restaurantName} ──`);
        last = u.restaurantName;
      }
      console.log(
        `  ${(u.catChanged ? "Δ" : "·").padEnd(5)} ${u.fromCategory.padEnd(15)} → ${u.toCategory.padEnd(15)}   ${(u.unitChanged ? "Δ" : "·").padEnd(5)} ${u.fromUnit.padEnd(7)} → ${u.toUnit.padEnd(7)}  "${u.name}"`,
      );
    }
  }

  if (skipsPriced.length > 0) {
    console.log(`\n⚠ Productos con precio cargado (omitidos por seguridad):`);
    for (const s of skipsPriced) {
      console.log(
        `    [${s.restaurantName}] "${s.name}"  cat:${s.currentCategory}→${s.proposedCategory}  unid:${s.currentUnit}→${s.proposedUnit}  (precio: ${(s.precio / 100).toFixed(2)} €)`,
      );
    }
  }

  if (!apply) {
    console.log(`\n(dry-run — ningún UPDATE ejecutado. Re-corré con --apply.)`);
    await prisma.$disconnect();
    return;
  }

  console.log(`\nEjecutando ${updates.length} UPDATEs (cat + unidad)...`);
  await prisma.$transaction(
    updates.map((u) =>
      prisma.product.update({
        where: { id: u.id },
        data: {
          category: u.toCategory as ProductCategory,
          unidadCompra: u.toUnit as ProductUnit,
        },
      }),
    ),
  );
  console.log(`UPDATE OK.`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
