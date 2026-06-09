// Reporte de dry-run de migración de recetas — script standalone, NO toca la
// DB (solo lee). Para correr:
//
//   cd apps/api
//   ../../packages/db/node_modules/.bin/tsx scripts/migration-dryrun-report.ts
//
// El env se carga manualmente desde apps/api/.env.local antes de importar
// Prisma (Prisma lee DATABASE_URL en init).
//
// Imprime 4 bloques pedidos por el chef:
//   1. Productos legacy actuales en el banco
//   2. Ingredientes únicos de recetas legacy, con parser + match + categoría
//   3. Casos concretos a revisar (hardcoded)
//   4. Estadísticas resumen

import { readFileSync } from "node:fs";
import { join } from "node:path";

// Carga manual de .env.local (sin dotenv) — solo lo necesario para DATABASE_URL.
// Tsx corre el script como CJS, __dirname está disponible global.
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
import { parseIngredient } from "../lib/products/parser";
import { categorizeFromName } from "../lib/products/defaults";
import { findMatch } from "../lib/products/matching";

// ───────── Helpers de formato ─────────

function pad(s: string, n: number): string {
  if (s.length >= n) return s.slice(0, n);
  return s + " ".repeat(n - s.length);
}

function divider(char = "─", n = 80): string {
  return char.repeat(n);
}

function title(s: string): string {
  return `\n${divider("═")}\n${s}\n${divider("═")}\n`;
}

function subtitle(s: string): string {
  return `\n${s}\n${divider()}`;
}

// ───────── Run ─────────

async function main() {
  const restaurants = await prisma.restaurant.findMany({
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });

  if (restaurants.length === 0) {
    console.log("No hay restaurantes en la DB.");
    return;
  }

  for (const restaurant of restaurants) {
    // Skip restaurants sin nada que mostrar (DBs de dev tienen sobras).
    const [pCount, rCount] = await Promise.all([
      prisma.product.count({ where: { restaurantId: restaurant.id, deletedAt: null } }),
      prisma.recipe.count({ where: { restaurantId: restaurant.id, deletedAt: null } }),
    ]);
    if (pCount === 0 && rCount === 0) continue;
    await reportForRestaurant(restaurant.id, restaurant.name);
  }

  await prisma.$disconnect();
}

async function reportForRestaurant(restaurantId: string, restaurantName: string) {
  console.log(title(`RESTAURANTE: ${restaurantName}  (${restaurantId})`));

  // ─────────── BLOQUE 1: productos legacy actuales ───────────
  const products = await prisma.product.findMany({
    where: { restaurantId, deletedAt: null },
    select: {
      id: true,
      name: true,
      category: true,
      unidadCompra: true,
      estado: true,
      aliases: true,
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  console.log(subtitle(`BLOQUE 1 — Productos actuales en el banco  (${products.length})`));
  console.log(
    `${pad("CATEGORÍA", 16)} ${pad("ESTADO", 10)} ${pad("UNIDAD", 8)} NOMBRE`,
  );
  console.log(divider());
  for (const p of products) {
    console.log(
      `${pad(p.category, 16)} ${pad(p.estado, 10)} ${pad(p.unidadCompra, 8)} ${p.name}` +
        (p.aliases.length > 0 ? `   (aliases: ${p.aliases.join(", ")})` : ""),
    );
  }

  const byCat = new Map<string, number>();
  for (const p of products) byCat.set(p.category, (byCat.get(p.category) ?? 0) + 1);
  console.log("");
  console.log("Conteo por categoría:");
  for (const [cat, count] of [...byCat.entries()].sort()) {
    console.log(`  ${pad(cat, 16)} ${count}`);
  }

  // ─────────── BLOQUE 2: ingredientes legacy parseados ───────────
  const recipes = await prisma.recipe.findMany({
    where: { restaurantId, deletedAt: null },
    select: {
      id: true,
      title: true,
      contentJson: true,
      recipeIngredients: { select: { id: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  type IngEntry = {
    raw: string;
    parsedName: string;
    parsedUnit: string | null;
    parsedQty: number | null;
    matchLevel: "exact" | "probable" | "none";
    matchProduct: string | null;
    matchDistance: number;
    category: string;
    recipes: string[];
  };

  const candidates = products
    .filter((p) => p.estado !== "archivado")
    .map((p) => ({ id: p.id, name: p.name, aliases: p.aliases }));

  const uniqueIngredients = new Map<string, IngEntry>();
  let totalIngredientLines = 0;
  let recipesAlreadyMigrated = 0;
  let recipesToMigrate = 0;

  for (const r of recipes) {
    if (r.recipeIngredients.length > 0) {
      recipesAlreadyMigrated++;
      continue;
    }
    recipesToMigrate++;
    const content = r.contentJson as { ingredients?: unknown };
    const ingArray = Array.isArray(content?.ingredients) ? content.ingredients : [];
    for (const raw of ingArray) {
      if (typeof raw !== "string" || raw.trim().length === 0) continue;
      totalIngredientLines++;
      const parsed = parseIngredient(raw.trim());
      const match = findMatch(parsed.name, candidates);
      const category =
        match.level === "exact"
          ? (products.find((p) => p.id === match.productId)?.category ?? "?")
          : categorizeFromName(parsed.name);

      const key = parsed.name.toLowerCase().trim();
      const existing = uniqueIngredients.get(key);
      if (existing) {
        if (!existing.recipes.includes(r.title)) existing.recipes.push(r.title);
        continue;
      }
      uniqueIngredients.set(key, {
        raw: parsed.raw,
        parsedName: parsed.name,
        parsedUnit: parsed.unit,
        parsedQty: parsed.quantity,
        matchLevel: match.level,
        matchProduct: match.productName,
        matchDistance: match.distance === Infinity ? -1 : match.distance,
        category,
        recipes: [r.title],
      });
    }
  }

  const entries = [...uniqueIngredients.values()].sort((a, b) => {
    const levelOrder = { exact: 0, probable: 1, none: 2 } as const;
    if (a.matchLevel !== b.matchLevel) {
      return levelOrder[a.matchLevel] - levelOrder[b.matchLevel];
    }
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.parsedName.localeCompare(b.parsedName);
  });

  console.log(subtitle(`BLOQUE 2 — Ingredientes únicos detectados  (${entries.length})`));
  console.log(
    `${pad("LVL", 11)} ${pad("CATEG.", 16)} ${pad("UNID.", 6)} ${pad("CANT.", 7)} NOMBRE LIMPIO ← raw`,
  );
  console.log(divider());

  for (const e of entries) {
    const lvl =
      e.matchLevel === "exact"
        ? `✓exact`
        : e.matchLevel === "probable"
          ? `~prob(${e.matchDistance})`
          : `+new`;
    const qty = e.parsedQty === null ? "—" : String(e.parsedQty);
    const unit = e.parsedUnit ?? "—";
    const matchSuffix =
      e.matchLevel === "exact"
        ? `  →  ${e.matchProduct}`
        : e.matchLevel === "probable"
          ? `  ?  ${e.matchProduct}`
          : ``;
    const recipesSuffix =
      e.recipes.length > 1 ? `  [×${e.recipes.length} recetas]` : "";
    console.log(
      `${pad(lvl, 11)} ${pad(e.category, 16)} ${pad(unit, 6)} ${pad(qty, 7)} "${e.parsedName}"  ←  "${e.raw}"${matchSuffix}${recipesSuffix}`,
    );
  }

  // ─────────── BLOQUE 2b: limpieza propuesta de PRODUCTOS existentes ───────────
  // (No se aplica todavía — es preview. Muestra qué pasaría si re-procesáramos
  // los nombres de productos legacy con el parser nuevo.)
  type CleanRow = {
    id: string;
    currentName: string;
    currentCategory: string;
    currentUnit: string;
    proposedName: string;
    proposedCategory: string;
    proposedUnit: string;
    qty: number | null;
    nameChanged: boolean;
    catChanged: boolean;
    unitChanged: boolean;
  };
  const cleanRows: CleanRow[] = [];
  for (const p of products) {
    const parsed = parseIngredient(p.name);
    const proposedName = parsed.name || p.name;
    const proposedCategory = categorizeFromName(proposedName);
    const proposedUnit = parsed.unit ?? p.unidadCompra;
    cleanRows.push({
      id: p.id,
      currentName: p.name,
      currentCategory: p.category,
      currentUnit: p.unidadCompra,
      proposedName,
      proposedCategory,
      proposedUnit,
      qty: parsed.quantity,
      nameChanged: proposedName !== p.name,
      catChanged: proposedCategory !== p.category,
      unitChanged: proposedUnit !== p.unidadCompra,
    });
  }
  const wouldChange = cleanRows.filter(
    (r) => r.nameChanged || r.catChanged || r.unitChanged,
  );

  console.log(
    subtitle(
      `BLOQUE 2b — Limpieza propuesta de productos del banco  (${wouldChange.length}/${cleanRows.length} cambiarían)`,
    ),
  );
  console.log(
    `${pad("Δ", 4)} ${pad("CAT. ACTUAL", 14)} → ${pad("CAT. PROP.", 14)} ${pad("UNID.", 8)} ${pad("CANT.", 6)} NOMBRE ACTUAL → NOMBRE LIMPIO`,
  );
  console.log(divider());
  for (const r of cleanRows) {
    const delta =
      (r.nameChanged ? "N" : "·") +
      (r.catChanged ? "C" : "·") +
      (r.unitChanged ? "U" : "·");
    const arrow = r.nameChanged ? `→` : `=`;
    const unitDelta = r.unitChanged
      ? `${r.currentUnit}→${r.proposedUnit}`
      : r.proposedUnit;
    console.log(
      `${pad(delta, 4)} ${pad(r.currentCategory, 14)} → ${pad(r.proposedCategory, 14)} ${pad(unitDelta, 8)} ${pad(r.qty?.toString() ?? "—", 6)} "${r.currentName}"  ${arrow}  "${r.proposedName}"`,
    );
  }
  console.log("");
  console.log(
    `Leyenda Δ: N=nombre cambia, C=categoría cambia, U=unidad cambia, · sin cambio`,
  );

  // ─────────── BLOQUE 3: casos concretos ───────────
  const TEST_CASES = [
    "15ml Colatura di Alici de Cetara",
    "16 Gamberi Rossi di Mazara del Vallo",
    "1g Polvo de Plancton o 2g de Alga Nori",
    "2 Zucchine baby con il loro Fiore",
    "20g Capperi di Pantelleria (sotto sale)",
  ];

  console.log(subtitle(`BLOQUE 3 — Casos concretos a revisar`));
  console.log("");
  for (const raw of TEST_CASES) {
    const parsed = parseIngredient(raw);
    const match = findMatch(parsed.name, candidates);
    const category =
      match.level === "exact"
        ? (products.find((p) => p.id === match.productId)?.category ?? "?")
        : categorizeFromName(parsed.name);
    const lvl =
      match.level === "exact"
        ? `✓ MATCH EXACTO con "${match.productName}"`
        : match.level === "probable"
          ? `~ PROBABLE (distancia ${match.distance}) con "${match.productName}"`
          : `+ DRAFT NUEVO`;
    console.log(`raw       : "${raw}"`);
    console.log(`  cantidad: ${parsed.quantity ?? "(no detectada)"}`);
    console.log(`  unidad  : ${parsed.unit ?? "(no detectada)"}`);
    console.log(`  nombre  : "${parsed.name}"`);
    console.log(`  cat.    : ${category}`);
    console.log(`  match   : ${lvl}`);
    console.log("");
  }

  // ─────────── BLOQUE 4: estadísticas ───────────
  const exactCount = entries.filter((e) => e.matchLevel === "exact").length;
  const probableCount = entries.filter((e) => e.matchLevel === "probable").length;
  const noneCount = entries.filter((e) => e.matchLevel === "none").length;
  const ambiguous = entries.filter(
    (e) =>
      e.matchLevel === "none" && (e.parsedQty === null || e.parsedUnit === null),
  ).length;

  const cleanNameOnly = cleanRows.filter((r) => r.nameChanged && !r.catChanged && !r.unitChanged).length;
  const cleanCatOnly = cleanRows.filter((r) => !r.nameChanged && r.catChanged && !r.unitChanged).length;
  const cleanFull = cleanRows.filter((r) => r.nameChanged && r.catChanged).length;
  const noChange = cleanRows.filter((r) => !r.nameChanged && !r.catChanged && !r.unitChanged).length;

  console.log(subtitle(`BLOQUE 4 — Estadísticas`));
  console.log(`Migración de recetas legacy:`);
  console.log(`  Recetas totales (no eliminadas):      ${recipes.length}`);
  console.log(`  Recetas ya migradas (skip):           ${recipesAlreadyMigrated}`);
  console.log(`  Recetas a migrar:                     ${recipesToMigrate}`);
  console.log(`  Líneas de ingrediente totales:        ${totalIngredientLines}`);
  console.log(`  Ingredientes únicos tras dedupe:      ${entries.length}`);
  console.log(`  Match exacto con banco existente:     ${exactCount}`);
  console.log(`  Match probable (revisar):             ${probableCount}`);
  console.log(`  Sin match → draft nuevo:              ${noneCount}`);
  console.log(`  Drafts sin cantidad/unidad parseada:  ${ambiguous}`);
  console.log("");
  console.log(`Limpieza de productos del banco existentes:`);
  console.log(`  Productos en banco hoy:               ${products.length}`);
  console.log(`  Sin cambios (ya limpios):             ${noChange}`);
  console.log(`  Cambiaría sólo nombre:                ${cleanNameOnly}`);
  console.log(`  Cambiaría sólo categoría:             ${cleanCatOnly}`);
  console.log(`  Cambiaría nombre + categoría:         ${cleanFull}`);
  console.log(`  Total con algún cambio:               ${wouldChange.length}`);
  console.log("");
  console.log(`Productos finales tras migración:       ${products.length + noneCount}  (banco actual + drafts nuevos)`);
}

main().catch((err) => {
  console.error("ERROR fatal:", err);
  process.exit(1);
});
