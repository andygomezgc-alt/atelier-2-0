// scripts/products-merge.mjs
//
// Une productos duplicados del banco en uno canónico.
//   node scripts/products-merge.mjs --canonical <id> --dups <id,id,...> [--apply]
//
// Sin --apply: DRY-RUN — imprime qué haría y no escribe nada.
// Con --apply: en una transacción: re-enlaza RecipeIngredient.productId,
// agrega nombre+aliases de los duplicados como aliases del canónico y
// archiva los duplicados (estado=archivado; NO se borran).
//
// DATABASE_URL viene del entorno (el operador decide contra qué base corre).
// PROD solo con el OK explícito de Andy.

import { createRequire } from "node:module";

const require = createRequire(new URL("../packages/db/package.json", import.meta.url));
const { PrismaClient } = require("@prisma/client");

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const canonicalId = arg("canonical");
const dupIds = (arg("dups") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const apply = process.argv.includes("--apply");

if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL en el entorno.");
  process.exit(1);
}
if (!canonicalId || dupIds.length === 0) {
  console.error("Uso: node scripts/products-merge.mjs --canonical <id> --dups <id,id,...> [--apply]");
  process.exit(1);
}
if (dupIds.includes(canonicalId)) {
  console.error("El canónico no puede estar en la lista de duplicados.");
  process.exit(1);
}

const prisma = new PrismaClient();

const canonical = await prisma.product.findUnique({ where: { id: canonicalId } });
if (!canonical) {
  console.error(`Canónico ${canonicalId} no existe.`);
  process.exit(1);
}
const dups = await prisma.product.findMany({ where: { id: { in: dupIds } } });
const missing = dupIds.filter((id) => !dups.some((d) => d.id === id));
if (missing.length > 0) {
  console.error(`Duplicados inexistentes: ${missing.join(", ")}`);
  process.exit(1);
}
const foreign = dups.filter((d) => d.restaurantId !== canonical.restaurantId);
if (foreign.length > 0) {
  console.error(`Duplicados de OTRO restaurante (abortando): ${foreign.map((d) => d.id).join(", ")}`);
  process.exit(1);
}

// Aliases nuevos: nombre + aliases de cada duplicado, sin repetir (case-insens)
// y sin duplicar el nombre del canónico.
const known = new Set([canonical.name.toLowerCase(), ...canonical.aliases.map((a) => a.toLowerCase())]);
const newAliases = [];
for (const d of dups) {
  for (const candidate of [d.name, ...d.aliases]) {
    if (!known.has(candidate.toLowerCase())) {
      known.add(candidate.toLowerCase());
      newAliases.push(candidate);
    }
  }
}

const ingCounts = await Promise.all(
  dups.map((d) => prisma.recipeIngredient.count({ where: { productId: d.id } })),
);

console.log(`\nCanónico: "${canonical.name}" (${canonical.id}) estado=${canonical.estado}`);
for (let i = 0; i < dups.length; i++) {
  console.log(`  ← "${dups[i].name}" (${dups[i].id}) — ${ingCounts[i]} ingrediente(s) a re-enlazar`);
}
console.log(`Aliases a agregar al canónico: ${JSON.stringify(newAliases)}`);

if (!apply) {
  console.log("\nDRY-RUN: no se escribió nada. Agregá --apply para ejecutar (solo con OK de Andy).");
  await prisma.$disconnect();
  process.exit(0);
}

await prisma.$transaction(async (tx) => {
  for (const d of dups) {
    await tx.recipeIngredient.updateMany({
      where: { productId: d.id },
      data: { productId: canonical.id },
    });
    await tx.product.update({
      where: { id: d.id },
      data: { estado: "archivado" },
    });
  }
  await tx.product.update({
    where: { id: canonical.id },
    data: { aliases: [...canonical.aliases, ...newAliases] },
  });
});

console.log("\nHECHO: ingredientes re-enlazados, duplicados archivados, aliases sumados.");
await prisma.$disconnect();
