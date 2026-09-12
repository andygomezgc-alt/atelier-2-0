// Creates two temporary databases ONLY on the known QA endpoint, then deletes
// exactly those databases. Never exports or restores real chef data.
// node --env-file=apps/api/.env.local scripts/check-db-backup.mjs
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { appendFile, copyFile, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { checksum, createBackup, restoreBackup, verifyBackup } from "./lib/pg-backup.mjs";
const require = createRequire(new URL("../packages/db/package.json", import.meta.url));
const { PrismaClient, Prisma } = require("@prisma/client");

async function fingerprint(client) {
  const tables = [...Prisma.dmmf.datamodel.models.map((model) => model.name), "_prisma_migrations"].sort();
  const result = {};
  for (const table of tables) {
    assert.match(table, /^[a-zA-Z_]+$/);
    const rows = await client.$queryRawUnsafe(`SELECT row_to_json(t)::text AS row FROM public."${table}" t ORDER BY row_to_json(t)::text`);
    result[table] = { count: rows.length, sha256: createHash("sha256").update(JSON.stringify(rows)).digest("hex") };
  }
  return result;
}

async function fixture(p) {
  const restaurantId = "backup-restaurant", authorId = "backup-chef";
  const r = { restaurantId }, a = { ...r, authorId };
  await p.restaurant.create({ data: { id: restaurantId, name: "Cocina QA — ñ", inviteCode: "backup-qa", identityLine: "Verduras de temporada", menuStyleSpec: Prisma.JsonNull, menuStyleTheme: Prisma.DbNull, menuStyleRefUrl: "https://example.test/reference.pdf" } });
  await p.user.create({ data: { id: authorId, ...r, name: "Chef QA", email: "chef@backup.example.test", role: "admin" } });
  await p.account.create({ data: { userId: authorId, type: "oauth", provider: "fixture", providerAccountId: "fixture-user", access_token: "synthetic-not-a-token" } });
  await p.session.create({ data: { userId: authorId, sessionToken: "synthetic-session", expires: new Date("2030-01-01") } });
  await p.verificationToken.create({ data: { identifier: "fixture", token: "synthetic-verification", expires: new Date("2030-01-01") } });
  await p.idea.create({ data: { id: "idea", ...a, text: "Berenjena y yogur" } });
  await p.ideaCreateReceipt.create({ data: { ...a, ideaId: "idea", clientRequestId: "fixture-save", requestHash: "a".repeat(64) } });
  await p.conversation.create({ data: { id: "chat", ...a, ideaId: "idea", modelUsed: "fixture" } });
  await p.message.create({ data: { conversationId: "chat", role: "user", content: "Una receta\ncon berenjena", clientMessageId: "fixture-message" } });
  await p.aiUsage.create({ data: { userId: authorId, day: "2026-09-10", requestCount: 2, inputTokens: 20, outputTokens: 30 } });
  await p.culinaryMemory.create({ data: { ...r, enabled: true, learned: [{ key: "techniques", text: "Asados" }], corrections: [], excludedKeys: ["ingredients"] } });
  await p.culinaryMemoryRun.create({ data: { ...r, provider: "fixture", model: "fixture", status: "completed", inputTokens: 20 } });
  await p.product.create({ data: { id: "product", ...r, name: "Yogur", category: "lacteo", unidadCompra: "kg", precioCompra: 1234, mermaPct: "12.34", criticality: "media", aliases: ["yogurt"], allergens: ["milk"], allergensReviewed: true } });
  await p.productPriceHistory.create({ data: { productId: "product", authorId, precio: 1200, unidadCompra: "kg" } });
  await p.yieldTest.create({ data: { ...a, productId: "product", pesoBrutoG: "1234.567", pesoUtilG: "1000.001", mermaCalculadaPct: "19.00" } });
  await p.recipe.create({ data: { id: "recipe", ...a, title: "Berenjena", sourceConversationId: "chat", contentJson: { ingredients: ["0,123 kg yogur"], method: ["Asar y servir"], notes: "Prueba\nñ" }, state: "approved", approvedById: authorId, portions: 4, manualAllergens: ["eggs"], salePrice: 1800 } });
  await p.recipeIngredient.create({ data: { recipeId: "recipe", productId: "product", position: 0, rawText: "0,123 kg yogur", qty: "0.123", unit: "kg", mermaOverridePct: "10.01" } });
  await p.menuFolder.create({ data: { id: "menu", ...r, name: "Menú QA", inService: true, serviceCharges: [{ name: "Pan", price: 200 }] } });
  await p.menuSection.create({ data: { id: "section", menuFolderId: "menu", name: "Entrantes", order: 0 } });
  await p.menuItem.create({ data: { menuFolderId: "menu", sectionId: "section", recipeId: "recipe", price: 1800, order: 0 } });
  await p.menuClientOverride.create({ data: { menuFolderId: "menu", overrides: { subtitle: "Otoño" } } });
  await p.menuStyleVersion.create({ data: { ...r, name: "Estilo QA", spec: { columns: 2 }, theme: { html: "<main>QA</main>" }, refUrl: "https://example.test/reference.pdf" } });
  await p.auditLog.create({ data: { ...r, actorId: authorId, action: "fixture", payload: { approved: true } } });
  await p.processedStripeEvent.create({ data: { id: "synthetic-event" } });
}

async function main() {
  const base = new URL(process.env.DATABASE_URL);
  assert.equal(base.hostname.replace("-pooler", ""), "ep-summer-heart-alhlh8nm.c-3.eu-central-1.aws.neon.tech", "Only the isolated QA endpoint is allowed");
  base.hostname = base.hostname.replace("-pooler", "");
  const prefix = `atelier_backup_qa_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const names = [`${prefix}_source`, `${prefix}_restore`];
  const urls = names.map((name) => { const value = new URL(base); value.pathname = `/${name}`; return value.href; });
  const admin = new PrismaClient({ datasourceUrl: base.href });
  const clients = urls.map((datasourceUrl) => new PrismaClient({ datasourceUrl }));
  const created = [];
  try {
    for (const name of names) {
      assert.match(name, /^atelier_backup_qa_[a-f0-9]{12}_(source|restore)$/);
      await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
      created.push(name);
    }
    await promisify(execFile)(process.execPath, ["packages/db/node_modules/prisma/build/index.js", "migrate", "deploy", "--schema", "packages/db/prisma/schema.prisma"], { env: { ...process.env, DATABASE_URL: urls[0] }, windowsHide: true });
    await fixture(clients[0]);
    const before = await fingerprint(clients[0]);
    const backup = await createBackup({ databaseUrl: urls[0], outDir: resolve("output/backup-qa") });
    await assert.rejects(restoreBackup({ archive: backup.archive, databaseUrl: urls[0], apply: true }), /coincide con el origen/);
    const dryRun = await restoreBackup({ archive: backup.archive, databaseUrl: urls[1] });
    assert.equal(dryRun.status, "verified");
    assert.equal(Number((await clients[1].$queryRawUnsafe("SELECT count(*) FROM pg_tables WHERE schemaname='public'"))[0].count), 0);
    // A structurally readable archive can still fail halfway through its data.
    // Update its checksum here deliberately to reach the native restore failure.
    const incomplete = `${backup.archive}.truncated`;
    const bytes = await readFile(backup.archive);
    await writeFile(incomplete, bytes.subarray(0, bytes.length - 200));
    await writeFile(`${incomplete}.json`, JSON.stringify({ ...backup.manifest, archive: backup.manifest.archive + ".truncated", bytes: bytes.length - 200, sha256: await checksum(incomplete) }));
    await assert.rejects(restoreBackup({ archive: incomplete, databaseUrl: urls[1], apply: true }), /pg_restore falló/);
    assert.equal(Number((await clients[1].$queryRawUnsafe("SELECT count(*) FROM pg_tables WHERE schemaname='public'"))[0].count), 0, "A failed restore must roll back all tables");
    // A non-system schema whose name starts with 'pg' is still user data.
    await clients[1].$executeRawUnsafe('CREATE SCHEMA pgfixture');
    await assert.rejects(restoreBackup({ archive: backup.archive, databaseUrl: urls[1], apply: true }), /no está vacío/);
    await clients[1].$executeRawUnsafe('DROP SCHEMA pgfixture');
    await restoreBackup({ archive: backup.archive, databaseUrl: urls[1], apply: true });
    assert.deepEqual(await fingerprint(clients[1]), before, "Every table and migration row must round-trip exactly");
    const nulls = await clients[1].$queryRawUnsafe('SELECT "menuStyleSpec" IS NULL AS "sqlNull", "menuStyleSpec" = \'null\'::jsonb AS "jsonNull", "menuStyleTheme" IS NULL AS "themeNull" FROM "Restaurant"');
    assert.deepEqual(nulls, [{ sqlNull: false, jsonNull: true, themeNull: true }]);
    const memory = await clients[1].culinaryMemory.findUniqueOrThrow({ where: { restaurantId: "backup-restaurant" } });
    await clients[1].recipe.update({ where: { id: "recipe" }, data: { title: "Cambio tras restaurar" } });
    assert.equal((await clients[1].culinaryMemory.findUniqueOrThrow({ where: { restaurantId: "backup-restaurant" } })).dirtyRevision, memory.dirtyRevision + 1);
    await assert.rejects(restoreBackup({ archive: backup.archive, databaseUrl: urls[1], apply: true }), /no está vacío/);
    const damaged = `${backup.archive}.damaged`;
    await copyFile(backup.archive, damaged);
    const manifest = JSON.parse(await readFile(backup.manifestPath, "utf8"));
    manifest.archive += ".damaged";
    await writeFile(`${damaged}.json`, JSON.stringify(manifest));
    await appendFile(damaged, "damaged");
    await assert.rejects(verifyBackup(damaged), /incompleta o fue modificada/);
    console.log(JSON.stringify({ status: "passed", tables: Object.keys(before).length, rows: Object.values(before).reduce((sum, item) => sum + item.count, 0), archive: backup.archive, realAiCalls: 0, checks: ["complete row fingerprints", "JSON null vs SQL NULL", "decimal precision", "relations and migrations", "memory trigger after restore", "read-only preview", "refuse source", "refuse populated target", "corruption rejected", "partial failure rolls back", "non-system pg-prefixed schema blocked"] }));
  } finally {
    for (const client of clients) await client.$disconnect();
    for (const name of created.reverse()) {
      assert.ok(names.includes(name) && /^atelier_backup_qa_[a-f0-9]{12}_(source|restore)$/.test(name));
      await admin.$executeRawUnsafe(`DROP DATABASE "${name}" WITH (FORCE)`);
    }
    await admin.$disconnect();
  }
}
main().catch(() => { console.error("El ensayo de copia/restauración falló; no se considera validado. No se usaron bases de producción."); process.exitCode = 1; });
