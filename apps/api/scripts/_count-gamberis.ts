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
(async () => {
  const all = await prisma.product.findMany({
    where: { name: { contains: "Gamberi" } },
    select: { id: true, name: true, deletedAt: true, createdAt: true, pezzaturaMode: true, pezzaturaMin: true, pezzaturaMax: true, estado: true },
    orderBy: { createdAt: "asc" },
  });
  console.log(`Encontrados: ${all.length}`);
  for (const p of all) {
    console.log(JSON.stringify(p, null, 2));
  }
  await prisma.$disconnect();
})();
