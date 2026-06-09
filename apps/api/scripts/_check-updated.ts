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
  const g = await prisma.product.findFirst({
    where: { name: { contains: "Gamberi" } },
    select: { name: true, pezzaturaMode: true, pezzaturaMin: true, pezzaturaMax: true, updatedAt: true, mermaPct: true, precioCompra: true },
  });
  const r = await prisma.product.findFirst({
    where: { name: { contains: "Ricciola" } },
    select: { name: true, pezzaturaMode: true, pezzaturaMin: true, pezzaturaMax: true, updatedAt: true, mermaPct: true, precioCompra: true },
  });
  console.log("Gamberi:", JSON.stringify(g, null, 2));
  console.log("Ricciola:", JSON.stringify(r, null, 2));
  await prisma.$disconnect();
})();
