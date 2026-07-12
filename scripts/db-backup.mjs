// scripts/db-backup.mjs
//
// Volcado lógico completo de la base (todas las tablas del schema Prisma) a
// un JSON con fecha, para tener copia de seguridad de las recetas de los
// chefs. SOLO LEE la base; no escribe nada en ella.
//
//   DATABASE_URL="<url>" node scripts/db-backup.mjs [carpeta-destino]
//
// Destino default: C:/Users/Utente/Desktop/ATELIER-BACKUPS/db
// El archivo NO va al repo (contiene datos reales de los chefs).

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(new URL("../packages/db/package.json", import.meta.url));
const { PrismaClient, Prisma } = require("@prisma/client");

if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL en el entorno.");
  process.exit(1);
}

const outDir = process.argv[2] ?? "C:/Users/Utente/Desktop/ATELIER-BACKUPS/db";
const prisma = new PrismaClient();

const models = Prisma.dmmf.datamodel.models.map((m) => m.name);
const dump = { takenAt: new Date().toISOString(), tables: {} };
let total = 0;

for (const name of models) {
  const client = prisma[name.charAt(0).toLowerCase() + name.slice(1)];
  if (!client?.findMany) continue;
  const rows = await client.findMany();
  dump.tables[name] = rows;
  total += rows.length;
  console.log(`  ${name.padEnd(24)} ${rows.length} filas`);
}

mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
const file = join(outDir, `atelier-db-${stamp}.json`);
// Serializar Date/Decimal/BigInt de forma segura.
writeFileSync(
  file,
  JSON.stringify(dump, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 1),
);
console.log(`\nOK: ${models.length} tablas, ${total} filas -> ${file}`);
await prisma.$disconnect();
