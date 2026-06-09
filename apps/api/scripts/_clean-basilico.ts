// Limpia el name del producto Basilico Genovese DOP en banco — quitamos el
// prefijo "mazzetto di" que quedó del rawText original.
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
  const updated = await prisma.product.update({
    where: { id: "cmp7gvywy00077ka0mcszhfsb" },
    data: { name: "Basilico Genovese DOP" },
    select: { id: true, name: true },
  });
  console.log(`UPDATE OK: ${updated.id} → name="${updated.name}"`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
