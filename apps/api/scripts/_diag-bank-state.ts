// Diagnóstico read-only del estado actual del banco para un restaurantId.
// Investiga la queja de Andy 2026-05-17: 36 productos cuando deberían ser 27.
//
// Uso:
//   ../../packages/db/node_modules/.bin/tsx scripts/_diag-bank-state.ts <restaurantId>
//
// NO escribe nada en DB.

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

async function main() {
  const restaurantId = process.argv[2];
  if (!restaurantId) {
    console.error("Falta restaurantId");
    process.exit(1);
  }

  // 1. Inventario completo ordenado por createdAt.
  const products = await prisma.product.findMany({
    where: { restaurantId },
    select: {
      id: true,
      name: true,
      category: true,
      unidadCompra: true,
      precioCompra: true,
      mermaPct: true,
      mermaOrigen: true,
      estado: true,
      deletedAt: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { recipeIngredients: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const active = products.filter((p) => p.deletedAt === null);
  const deleted = products.filter((p) => p.deletedAt !== null);

  console.log(`\n═══ Inventario Dev Kitchen (${restaurantId}) ═══`);
  console.log(`Total Product rows: ${products.length}  (activos: ${active.length}, soft-deleted: ${deleted.length})\n`);

  // 2. Listado completo con createdAt.
  console.log(`──── ACTIVOS (ordenados por createdAt) ────\n`);
  let prevDay = "";
  for (const p of active) {
    const day = p.createdAt.toISOString().slice(0, 10);
    if (day !== prevDay) {
      console.log(`  ── ${day} ──`);
      prevDay = day;
    }
    const time = p.createdAt.toISOString().slice(11, 19);
    const precio = p.precioCompra > 0 ? `${(p.precioCompra / 100).toFixed(2)}€` : "0";
    const merma = `${Number(p.mermaPct.toString()).toFixed(0)}%`;
    const links = p._count.recipeIngredients;
    console.log(
      `    [${time}] ${p.estado.padEnd(9)} ${p.category.padEnd(15)} ${p.unidadCompra.padEnd(6)} ${precio.padStart(8)} ${merma.padStart(5)} ${p.mermaOrigen.padEnd(10)} links=${links.toString().padStart(2)}  "${p.name}"  ${p.id}`,
    );
  }

  if (deleted.length > 0) {
    console.log(`\n──── SOFT-DELETED ────\n`);
    for (const p of deleted) {
      console.log(`  [${p.createdAt.toISOString()}] "${p.name}"  deletedAt=${p.deletedAt?.toISOString()}`);
    }
  }

  // 3. AuditLog de las últimas 24h del restaurante.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const audits = await prisma.auditLog.findMany({
    where: { restaurantId, createdAt: { gte: since } },
    select: {
      id: true,
      action: true,
      actorId: true,
      createdAt: true,
      payload: true,
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`\n──── AUDIT LOG últimas 24h (${audits.length} eventos) ────\n`);
  for (const a of audits) {
    const time = a.createdAt.toISOString().slice(11, 19);
    const payload = a.payload as Record<string, unknown> | null;
    const summary = payload
      ? Object.entries(payload)
          .filter(([k]) => !["changes", "newDrafts", "conflicts"].includes(k))
          .slice(0, 4)
          .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v).slice(0, 60) : v}`)
          .join(" ")
      : "(no payload)";
    console.log(`  [${a.createdAt.toISOString().slice(0, 10)} ${time}] ${a.action.padEnd(32)} actor=${a.actorId ?? "system"}  ${summary}`);
  }

  // 4. Para cada producto activo, mostrar a qué RecipeIngredient está enlazado.
  console.log(`\n──── ENLACES Product → RecipeIngredient ────\n`);
  const productIds = active.map((p) => p.id);
  const links = await prisma.recipeIngredient.findMany({
    where: { productId: { in: productIds } },
    select: {
      productId: true,
      rawText: true,
      recipe: { select: { id: true, title: true, createdAt: true } },
    },
  });
  const linksByProduct = new Map<string, typeof links>();
  for (const l of links) {
    if (!l.productId) continue;
    const arr = linksByProduct.get(l.productId) ?? [];
    arr.push(l);
    linksByProduct.set(l.productId, arr);
  }

  // Productos creados los últimos días (sospechosos) — los listamos con sus links.
  const recent = active.filter((p) => p.createdAt >= since);
  console.log(`Productos creados en últimas 24h (${recent.length}):\n`);
  for (const p of recent) {
    const ls = linksByProduct.get(p.id) ?? [];
    console.log(`  "${p.name}"  (createdAt=${p.createdAt.toISOString().slice(0, 19)})`);
    if (ls.length === 0) {
      console.log(`    sin RecipeIngredient enlazados.`);
    } else {
      for (const l of ls) {
        console.log(
          `    → "${l.recipe.title}"  (${l.recipe.id})  rawText="${l.rawText}"`,
        );
      }
    }
  }

  // 5. Stats por estado + unidad.
  const byEstado = new Map<string, number>();
  const byUnit = new Map<string, number>();
  const byCat = new Map<string, number>();
  for (const p of active) {
    byEstado.set(p.estado, (byEstado.get(p.estado) ?? 0) + 1);
    byUnit.set(p.unidadCompra, (byUnit.get(p.unidadCompra) ?? 0) + 1);
    byCat.set(p.category, (byCat.get(p.category) ?? 0) + 1);
  }
  console.log(`\n──── STATS productos activos ────\n`);
  console.log(`  Por estado:`);
  for (const [k, v] of byEstado) console.log(`    ${k.padEnd(12)} ${v}`);
  console.log(`  Por unidadCompra:`);
  for (const [k, v] of byUnit) console.log(`    ${k.padEnd(12)} ${v}`);
  console.log(`  Por categoría:`);
  for (const [k, v] of byCat) console.log(`    ${k.padEnd(15)} ${v}`);

  // 6. Detectar duplicados por nombre normalizado (señal de re-migración).
  console.log(`\n──── DUPLICADOS por nombre normalizado ────\n`);
  const groups = new Map<string, typeof active>();
  for (const p of active) {
    const key = p.name.toLowerCase().trim();
    const arr = groups.get(key) ?? [];
    arr.push(p);
    groups.set(key, arr);
  }
  const dups = [...groups.entries()].filter(([, arr]) => arr.length > 1);
  if (dups.length === 0) {
    console.log(`  (ninguno)`);
  } else {
    for (const [name, arr] of dups) {
      console.log(`  "${name}"  ×${arr.length}:`);
      for (const p of arr) {
        console.log(`    ${p.id}  createdAt=${p.createdAt.toISOString().slice(0, 19)}  precio=${(p.precioCompra / 100).toFixed(2)}€  estado=${p.estado}`);
      }
    }
  }

  // 7. Detectar similares (mismo prefix después de quitar números/units).
  console.log(`\n──── PRODUCTOS CON CANTIDAD/UNIDAD EN EL NOMBRE ────\n`);
  const chapuceros = active.filter((p) => /^\d+\s*(?:g|kg|ml|l|unidad|piez)?\s+/i.test(p.name));
  if (chapuceros.length === 0) {
    console.log(`  (ninguno — nombres limpios)`);
  } else {
    for (const p of chapuceros) {
      console.log(`  "${p.name}"  createdAt=${p.createdAt.toISOString().slice(0, 19)}  ${p.id}`);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
