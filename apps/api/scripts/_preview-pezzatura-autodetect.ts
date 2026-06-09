// Preview de la auto-detección de pezzatura sobre los 28 productos de Dev
// Kitchen. NO escribe nada en DB — solo corre detectPezzaturaFromName y
// muestra el resultado. Sirve para que el chef revise antes de Fase 3 si
// hay clasificaciones raras y ajuste keywords si hace falta.
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
  detectPezzaturaFromName,
  formatPezzatura,
  resolvePezzaturaMode,
} from "@atelier/shared";

const RESTAURANT_ID = "cmp1gddcr00ce7k1g8dbybrx9"; // Dev Kitchen

async function main() {
  const products = await prisma.product.findMany({
    where: { restaurantId: RESTAURANT_ID, deletedAt: null },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    select: { id: true, name: true, category: true },
  });

  console.log(`\n═══ Preview auto-detect pezzatura — ${products.length} productos ═══\n`);

  let detected = 0;
  let modeOnly = 0;
  let noMode = 0;
  const detectedRows: Array<{ name: string; category: string; mode: string; render: string }> = [];
  const modeOnlyRows: Array<{ name: string; category: string; mode: string }> = [];
  const noModeRows: Array<{ name: string; category: string }> = [];

  for (const p of products) {
    const mode = resolvePezzaturaMode(p.name, p.category);
    const value = detectPezzaturaFromName(p.name, p.category);

    if (value) {
      detected++;
      detectedRows.push({
        name: p.name,
        category: p.category,
        mode: value.mode,
        render: formatPezzatura(value),
      });
    } else if (mode) {
      modeOnly++;
      modeOnlyRows.push({ name: p.name, category: p.category, mode });
    } else {
      noMode++;
      noModeRows.push({ name: p.name, category: p.category });
    }
  }

  console.log(
    `Resumen:  detectados=${detected}  con modo pero sin calibre=${modeOnly}  sin pezzatura aplicable=${noMode}\n`,
  );

  if (detectedRows.length > 0) {
    console.log(`── AUTO-DETECTADOS (${detectedRows.length}) ──`);
    for (const r of detectedRows) {
      console.log(`  ✓ [${r.category.padEnd(10)}] ${r.name.padEnd(60)} → ${r.mode}  (${r.render})`);
    }
    console.log();
  }

  if (modeOnlyRows.length > 0) {
    console.log(`── CATEGORÍA ADMITE PEZZATURA, PERO EL NOMBRE NO TIENE CALIBRE (${modeOnlyRows.length}) ──`);
    console.log(`   (Fase 3 los va a dejar con pezzatura = null; el chef puede cargar manual.)`);
    for (const r of modeOnlyRows) {
      console.log(`  · [${r.category.padEnd(10)}] ${r.name.padEnd(60)} → modo: ${r.mode}`);
    }
    console.log();
  }

  if (noModeRows.length > 0) {
    console.log(`── CATEGORÍA NO APLICA PEZZATURA (${noModeRows.length}) ──`);
    console.log(`   (Estos nunca van a tener pezzatura; correcto.)`);
    for (const r of noModeRows) {
      console.log(`  · [${r.category.padEnd(10)}] ${r.name}`);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
