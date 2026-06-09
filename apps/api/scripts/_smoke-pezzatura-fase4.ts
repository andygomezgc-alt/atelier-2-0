// Smoke test Fase 4 — PATCH /api/products/[id] con pezzaturaInput.
// Casos:
//   1. PATCH Gamberi Rossi con "15/20" → debe persistir pz_per_kg 15/20.
//   2. PATCH "Pasta de wasabi" (seco, no admite pezzatura) con "15/20" → 400.
//   3. PATCH Gamberi Rossi con null → limpia (vuelve a null).
// Después de cada test, vuelve a dejar el banco en estado limpio.
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

const RESTAURANT_ID = "cmp1gddcr00ce7k1g8dbybrx9";

async function mintToken(): Promise<string> {
  const user = await prisma.user.findFirst({
    where: { restaurantId: RESTAURANT_ID, role: "admin" },
    select: { id: true, tokenVersion: true },
  });
  if (!user) throw new Error("No admin");
  const secret = process.env.MOBILE_JWT_SECRET ?? process.env.NEXTAUTH_SECRET!;
  return new SignJWT({ tv: user.tokenVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuer("atelier-mobile")
    .setAudience("atelier-api")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(secret));
}

async function http(
  path: string,
  init: RequestInit & { token: string },
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`http://localhost:3000${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${init.token}`,
      "Content-Type": "application/json",
    },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function main() {
  const token = await mintToken();

  // Encuentra Gamberi Rossi y pasta de wasabi por nombre.
  const gamberi = await prisma.product.findFirst({
    where: { restaurantId: RESTAURANT_ID, name: { contains: "Gamberi" } },
    select: { id: true, name: true, category: true, pezzaturaMode: true },
  });
  const wasabi = await prisma.product.findFirst({
    where: { restaurantId: RESTAURANT_ID, name: { contains: "wasabi" } },
    select: { id: true, name: true, category: true },
  });

  if (!gamberi || !wasabi) {
    console.error("No encontrados:", { gamberi, wasabi });
    process.exit(1);
  }

  console.log(`\nGamberi: ${gamberi.id} "${gamberi.name}" cat=${gamberi.category}`);
  console.log(`Wasabi:  ${wasabi.id} "${wasabi.name}" cat=${wasabi.category}\n`);

  // ─── Caso 1: PATCH Gamberi con "15/20" → pz_per_kg 15/20.
  console.log(`═══ Caso 1: PATCH Gamberi con pezzaturaInput="15/20" ═══`);
  const r1 = await http(`/api/products/${gamberi.id}`, {
    method: "PATCH",
    body: JSON.stringify({ pezzaturaInput: "15/20" }),
    token,
  });
  console.log(`status: ${r1.status}`);
  const b1 = r1.body as Record<string, unknown>;
  console.log(`pezzaturaMode: ${b1.pezzaturaMode}`);
  console.log(`pezzaturaMin:  ${b1.pezzaturaMin}`);
  console.log(`pezzaturaMax:  ${b1.pezzaturaMax}`);
  console.log(
    `  ${b1.pezzaturaMode === "pz_per_kg" && b1.pezzaturaMin === 15 && b1.pezzaturaMax === 20 ? "✓" : "✗"}\n`,
  );

  // ─── Caso 2: PATCH wasabi (seco, no admite) con "15/20" → 400.
  console.log(`═══ Caso 2: PATCH Wasabi (seco) con "15/20" → debe ser 400 ═══`);
  const r2 = await http(`/api/products/${wasabi.id}`, {
    method: "PATCH",
    body: JSON.stringify({ pezzaturaInput: "15/20" }),
    token,
  });
  console.log(`status: ${r2.status}`);
  const b2 = r2.body as Record<string, unknown>;
  console.log(`error: ${b2.error}`);
  console.log(`message: ${b2.message}`);
  console.log(`  ${r2.status === 400 && b2.error === "invalid_pezzatura" ? "✓" : "✗"}\n`);

  // ─── Caso 3: PATCH Gamberi con null → limpia.
  console.log(`═══ Caso 3: PATCH Gamberi con pezzaturaInput=null → limpia ═══`);
  const r3 = await http(`/api/products/${gamberi.id}`, {
    method: "PATCH",
    body: JSON.stringify({ pezzaturaInput: null }),
    token,
  });
  console.log(`status: ${r3.status}`);
  const b3 = r3.body as Record<string, unknown>;
  console.log(`pezzaturaMode: ${b3.pezzaturaMode}`);
  console.log(`pezzaturaMin:  ${b3.pezzaturaMin}`);
  console.log(`pezzaturaMax:  ${b3.pezzaturaMax}`);
  console.log(
    `  ${b3.pezzaturaMode === null && b3.pezzaturaMin === null && b3.pezzaturaMax === null ? "✓" : "✗"}\n`,
  );

  // ─── Caso 4: PATCH Gamberi con "4-6 kg" (g_per_piece) en producto marisco → 400.
  console.log(`═══ Caso 4: PATCH Gamberi (marisco) con "4-6 kg" → debe ser 400 ═══`);
  const r4 = await http(`/api/products/${gamberi.id}`, {
    method: "PATCH",
    body: JSON.stringify({ pezzaturaInput: "4-6 kg" }),
    token,
  });
  console.log(`status: ${r4.status}`);
  const b4 = r4.body as Record<string, unknown>;
  console.log(`error: ${b4.error}`);
  console.log(`  ${r4.status === 400 ? "✓" : "✗"}\n`);

  // ─── Caso 5: PATCH "Lomo de Ricciola" con "4-6 kg" → g_per_piece 4000/6000.
  const ricciola = await prisma.product.findFirst({
    where: { restaurantId: RESTAURANT_ID, name: { contains: "Ricciola" } },
    select: { id: true, name: true, category: true },
  });
  if (ricciola) {
    console.log(`═══ Caso 5: PATCH Ricciola con "4-6 kg" ═══`);
    const r5 = await http(`/api/products/${ricciola.id}`, {
      method: "PATCH",
      body: JSON.stringify({ pezzaturaInput: "4-6 kg" }),
      token,
    });
    console.log(`status: ${r5.status}`);
    const b5 = r5.body as Record<string, unknown>;
    console.log(`pezzaturaMode: ${b5.pezzaturaMode}`);
    console.log(`pezzaturaMin:  ${b5.pezzaturaMin}`);
    console.log(`pezzaturaMax:  ${b5.pezzaturaMax}`);
    console.log(
      `  ${b5.pezzaturaMode === "g_per_piece" && b5.pezzaturaMin === 4000 && b5.pezzaturaMax === 6000 ? "✓" : "✗"}\n`,
    );

    // Limpieza para no dejar pezzatura cargada (Andy lo hará desde Expo Go).
    await http(`/api/products/${ricciola.id}`, {
      method: "PATCH",
      body: JSON.stringify({ pezzaturaInput: null }),
      token,
    });
    console.log(`(Ricciola limpiada — Andy lo carga desde Expo Go.)`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
