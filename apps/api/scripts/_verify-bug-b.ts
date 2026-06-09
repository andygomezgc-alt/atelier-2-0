// Verificación Bug B: simula la lógica del endpoint /api/products/from-raw
// con varios rawTexts representativos. NO crea productos en DB — solo
// computa los campos que el endpoint usaría.
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

import { parseIngredient } from "../lib/products/parser";
import { categorizeFromName, defaultMermaPct } from "../lib/products/defaults";
import { defaultPurchaseUnit } from "../lib/products/purchase-unit";
import { defaultCriticality } from "../lib/products/criticality";

const CASES = [
  "50g pasta de wasabi",
  "2 huevos camperos",
  "Aceite trufa blanca",
  "100ml leche entera",
  "500g harina de garbanzos",
  "Manteca clarificada, 30 g",
  "1 mazzetto di Basilico Genovese",
  "Sale Maldon",
];

console.log(`\n═══ Simulación: createProductFromRaw para varios casos ═══\n`);
console.log(
  `${"rawText".padEnd(45)}  →  ${"name limpio".padEnd(30)}  cat              unidad   merma   crit`,
);
console.log("─".repeat(120));

for (const rawText of CASES) {
  const parsed = parseIngredient(rawText);
  const name = parsed.name || rawText.trim();
  const category = categorizeFromName(name);
  const unidadCompra = defaultPurchaseUnit(category, name);
  const merma = defaultMermaPct(category);
  const crit = defaultCriticality(category, name);
  console.log(
    `"${rawText}"`.padEnd(46) +
      ` →  "${name}"`.padEnd(33) +
      `  ${category.padEnd(15)}  ${unidadCompra.padEnd(7)}  ${merma.toString().padStart(3)}%   ${crit}`,
  );
}

console.log(`\nTest target — "50g pasta de wasabi":`);
{
  const rawText = "50g pasta de wasabi";
  const parsed = parseIngredient(rawText);
  const name = parsed.name || rawText.trim();
  const category = categorizeFromName(name);
  const unidadCompra = defaultPurchaseUnit(category, name);
  const merma = defaultMermaPct(category);
  console.log(
    `  name=${name === "pasta de wasabi" ? "✓" : "✗"} "${name}"   (esperado: "pasta de wasabi")`,
  );
  console.log(
    `  category=${category === "seco" ? "✓" : "✗"} ${category}   (esperado: seco — matchea "pasta" en seco keywords)`,
  );
  console.log(
    `  unidadCompra=${unidadCompra === "kg" ? "✓" : "✗"} ${unidadCompra}   (esperado: kg — seco es SOLID)`,
  );
  console.log(
    `  mermaPct=${merma === 0 ? "✓" : "✗"} ${merma}   (esperado: 0 — defaultMermaPct(seco) = 0)`,
  );
}
