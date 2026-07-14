// scripts/products-archived-to-trash.mjs
//
// Mueve los productos "archivados" legacy a la papelera (modelo nuevo:
// solo eliminar, no hay más "Archivar" en la UI). Reversible desde la app
// (Papelera → Restaurar).
//   node scripts/products-archived-to-trash.mjs [--apply]
//
// Sin --apply: DRY-RUN — imprime la lista (nombre + id + cuántos
// RecipeIngredient enlazados) y no escribe nada.
// Con --apply: updateMany estado="archivado" && deletedAt=null → deletedAt=now.
//
// Global (no toma --restaurant): a la fecha solo hay 4 productos archivados
// en prod, todos ricciolas duplicadas del merge, 0 ingredientes enlazados.
//
// DATABASE_URL viene del entorno (el operador decide contra qué base corre).
// PROD solo con el OK explícito de Andy.

import { createRequire } from "node:module";

const require = createRequire(new URL("../packages/db/package.json", import.meta.url));
const { PrismaClient } = require("@prisma/client");

const apply = process.argv.includes("--apply");

if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL en el entorno.");
  process.exit(1);
}

const prisma = new PrismaClient();

const archived = await prisma.product.findMany({
  where: { estado: "archivado", deletedAt: null },
});

if (archived.length === 0) {
  console.log("No hay productos archivados para mover a la papelera.");
  await prisma.$disconnect();
  process.exit(0);
}

const ingCounts = await Promise.all(
  archived.map((p) => prisma.recipeIngredient.count({ where: { productId: p.id } })),
);

console.log(`\n${archived.length} producto(s) archivado(s):`);
for (let i = 0; i < archived.length; i++) {
  console.log(`  "${archived[i].name}" (${archived[i].id}) — ${ingCounts[i]} ingrediente(s) enlazado(s)`);
}

if (!apply) {
  console.log("\nDRY-RUN: no se escribió nada. Agregá --apply para ejecutar (solo con OK de Andy).");
  await prisma.$disconnect();
  process.exit(0);
}

const result = await prisma.product.updateMany({
  where: { estado: "archivado", deletedAt: null },
  data: { deletedAt: new Date() },
});

console.log(`\nHECHO: ${result.count} producto(s) movido(s) a la papelera.`);
await prisma.$disconnect();
