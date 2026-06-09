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
  const recipe = await prisma.recipe.findFirst({
    where: { title: { contains: "Gambero Rosso" } },
    select: {
      id: true,
      title: true,
      recipeIngredients: {
        select: {
          position: true,
          rawText: true,
          productId: true,
          product: { select: { id: true, name: true, pezzaturaMode: true } },
        },
        where: { rawText: { contains: "Gamberi" } },
      },
    },
  });
  console.log("Recipe Gambero Rosso ingredients matching 'Gamberi':");
  console.log(JSON.stringify(recipe, null, 2));
  await prisma.$disconnect();
})();
