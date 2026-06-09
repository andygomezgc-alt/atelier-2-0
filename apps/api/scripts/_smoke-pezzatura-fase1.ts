// Smoke test Fase 1 — Pezzatura.
// 1) Genera un token JWT mobile para el admin de Dev Kitchen.
// 2) GET /api/products → confirma que cada producto incluye los 3 campos nuevos.
// 3) GET /api/recipes/<gambero-rosso> → confirma que cada recipeIngredient
//    incluye pesoCalculoG.
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
import { SignJWT } from "jose";

const RECIPE_ID = "cmp2hzl85001k7knwjt4va11j"; // Gambero Rosso
const RESTAURANT_ID = "cmp1gddcr00ce7k1g8dbybrx9"; // Dev Kitchen

async function mintToken(): Promise<string> {
  const user = await prisma.user.findFirst({
    where: { restaurantId: RESTAURANT_ID, role: "admin" },
    select: { id: true, tokenVersion: true, name: true },
  });
  if (!user) throw new Error("No admin in Dev Kitchen");
  const secret = process.env.MOBILE_JWT_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("MOBILE_JWT_SECRET or NEXTAUTH_SECRET missing");
  const token = await new SignJWT({ tv: user.tokenVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuer("atelier-mobile")
    .setAudience("atelier-api")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(secret));
  console.log(`Token para ${user.name}\n`);
  return token;
}

type HttpResult = { status: number; body: unknown };
async function httpGet(path: string, token: string): Promise<HttpResult> {
  const res = await fetch(`http://localhost:3000${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function main() {
  // 0) Query directa con Prisma client — confirma que el campo existe en DB
  // y que el cliente del script lo trae. Esto aísla el query engine del
  // server (que puede estar usando un .dll viejo si no se reinició tras
  // el prisma generate).
  console.log(`═══ Direct Prisma query (no HTTP) ═══`);
  const direct = await prisma.product.findFirst({
    where: { restaurantId: RESTAURANT_ID, deletedAt: null },
    select: {
      id: true,
      name: true,
      pezzatura: true,
      pezzaturaMode: true,
      pezzaturaMin: true,
      pezzaturaMax: true,
    },
  });
  console.log(JSON.stringify(direct, null, 2));
  console.log();

  const token = await mintToken();

  // 1) /api/products
  console.log(`═══ GET /api/products ═══`);
  const products = await httpGet("/api/products", token);
  console.log(`status: ${products.status}`);
  const productList = Array.isArray(products.body) ? products.body : [];
  console.log(`productos: ${productList.length}\n`);

  if (productList.length > 0) {
    const first = productList[0] as Record<string, unknown>;
    const newFieldsPresent =
      "pezzaturaMode" in first && "pezzaturaMin" in first && "pezzaturaMax" in first;
    console.log(`primer producto (raw shape):`);
    console.log(
      JSON.stringify(
        {
          id: first.id,
          name: first.name,
          category: first.category,
          pezzatura: first.pezzatura,
          pezzaturaMode: first.pezzaturaMode,
          pezzaturaMin: first.pezzaturaMin,
          pezzaturaMax: first.pezzaturaMax,
        },
        null,
        2,
      ),
    );
    console.log(`\n  campos nuevos presentes? ${newFieldsPresent ? "✓" : "✗"}`);
    const nullCount = productList.filter(
      (p) =>
        (p as Record<string, unknown>).pezzaturaMode === null &&
        (p as Record<string, unknown>).pezzaturaMin === null &&
        (p as Record<string, unknown>).pezzaturaMax === null,
    ).length;
    console.log(
      `  productos con los 3 nuevos campos en null: ${nullCount}/${productList.length}  (esperado: ${productList.length}/${productList.length})`,
    );
  }

  // 2) /api/recipes/<gambero-rosso>
  console.log(`\n═══ GET /api/recipes/${RECIPE_ID} ═══`);
  const recipe = await httpGet(`/api/recipes/${RECIPE_ID}`, token);
  console.log(`status: ${recipe.status}`);

  if (recipe.status === 200 && recipe.body) {
    const r = recipe.body as { title?: string; recipeIngredients?: unknown[] };
    console.log(`title: "${r.title}"`);
    const ings = Array.isArray(r.recipeIngredients) ? r.recipeIngredients : [];
    console.log(`ingredientes: ${ings.length}`);

    if (ings.length > 0) {
      const first = ings[0] as Record<string, unknown>;
      console.log(`\nprimer ingrediente (raw shape):`);
      console.log(
        JSON.stringify(
          {
            id: first.id,
            position: first.position,
            rawText: first.rawText,
            qty: first.qty,
            unit: first.unit,
            pesoCalculoG: first.pesoCalculoG,
            productName: (first.product as { name?: string } | null)?.name ?? null,
          },
          null,
          2,
        ),
      );
      const newFieldPresent = "pesoCalculoG" in first;
      console.log(`\n  campo nuevo presente? ${newFieldPresent ? "✓" : "✗"}`);
      const nullCount = ings.filter(
        (i) => (i as Record<string, unknown>).pesoCalculoG === null,
      ).length;
      console.log(
        `  ingredientes con pesoCalculoG en null: ${nullCount}/${ings.length}  (esperado: ${ings.length}/${ings.length})`,
      );
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
