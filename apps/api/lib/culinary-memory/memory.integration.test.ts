// Memoria culinaria contra PostgreSQL REAL.
//
// Cubre lo que las pruebas con mocks no pueden: los triggers SQL que marcan
// cambios en recetas, las transacciones concurrentes y la recuperación de
// trabajos interrumpidos. El proveedor de IA es simulado: cero llamadas pagadas.
//
// No corre en `pnpm test`. Necesita una base DESECHABLE con todas las
// migraciones aplicadas (CI usa su Postgres de servicio):
//
//   CULINARY_MEMORY_IT=1 pnpm --filter api exec vitest run lib/culinary-memory/memory.integration.test.ts
//
// Solo acepta DATABASE_URL en localhost. Para una base de pruebas remota hay
// que escribir su host exacto en CULINARY_MEMORY_IT_ALLOW_HOST. Nunca contra
// producción: crea y borra restaurantes.
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Prisma, prisma } from "@atelier/db";
import { chatMemory, patchCulinaryMemory } from "./service";
import { maintainMemoryRuns, processMemory } from "./worker";
import type { MemoryGenerator } from "./provider";

const enabled = process.env.CULINARY_MEMORY_IT === "1";
const DAY = 24 * 60 * 60 * 1000;
const config = { provider: "fixture", model: "fixture" };
const run = `it-${randomUUID().slice(0, 8)}`;

const roasted: MemoryGenerator = async (_input, onUsage) => {
  await onUsage({ inputTokens: 30, outputTokens: 10, reasoningTokens: 0 });
  return { trends: [{ key: "techniques", text: "Predominan las verduras asadas", sources: [1, 2, 3] }] };
};
const memoryOf = (restaurantId: string) => prisma.culinaryMemory.findUniqueOrThrow({ where: { restaurantId } });
const contextOf = async (restaurantId: string) => (await chatMemory(restaurantId)) ?? "";
const publishedRuns = (restaurantId: string) =>
  prisma.culinaryMemoryRun.count({ where: { restaurantId, publishedTrends: { not: Prisma.DbNull } } });

async function restaurant(name: string) {
  const id = `${run}-${name}`;
  const userId = `${id}-user`;
  await prisma.restaurant.create({ data: { id, name: "Memoria IT", inviteCode: id } });
  await prisma.user.create({ data: { id: userId, name: "IT", email: `${userId}@example.test`, role: "admin", restaurantId: id } });
  return { id, userId };
}

/** Restaurante con aprendizaje activado y tres elaboraciones asadas en prueba. */
async function seed(name: string) {
  const { id, userId } = await restaurant(name);
  await patchCulinaryMemory(id, { expectedVersion: 0, enabled: true });
  for (const [index, ingredient] of ["tomate", "berenjena", "calabaza"].entries()) {
    await prisma.recipe.create({ data: { id: `${id}-${index}`, restaurantId: id, authorId: userId, title: ingredient,
      state: "in_test", contentJson: { ingredients: [`200 g ${ingredient}`], method: [`Asar ${ingredient}`] } } });
  }
  return id;
}

// Fórmula de huella ANTERIOR a v2 (título + ingredientes + método + estado),
// escrita aparte a propósito para no fabricar los datos con el código a probar.
const legacyHash = (title: string, ingredient: string, method: string, state: string) =>
  createHash("sha256").update(JSON.stringify({ title, ingredients: [ingredient], method: [method.toLowerCase()], state })).digest("hex");

describe.runIf(enabled)("memoria culinaria sobre PostgreSQL", () => {
  vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

  beforeAll(async () => {
    const host = new URL(process.env.DATABASE_URL ?? "postgresql://sin-configurar").hostname;
    const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host);
    if (!local && host !== process.env.CULINARY_MEMORY_IT_ALLOW_HOST) {
      throw new Error(`Base no autorizada para pruebas de integración (${host}). Usa una base desechable o fija CULINARY_MEMORY_IT_ALLOW_HOST con su host exacto.`);
    }
    const rows = await prisma.$queryRaw<{ ready: boolean }[]>`SELECT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'CulinaryMemory' AND column_name = 'preparedContext') AS ready`;
    if (!rows[0]?.ready) throw new Error("La base no tiene las migraciones de memoria: aplica prisma migrate deploy antes.");
  });

  afterAll(async () => {
    // Borrar el restaurante arrastra recetas, memoria e intentos; los usuarios van después.
    await prisma.restaurant.deleteMany({ where: { id: { startsWith: run } } });
    await prisma.user.deleteMany({ where: { id: { startsWith: run } } });
    await prisma.$disconnect();
  });

  it("dos procesos a la vez generan una sola vez y la memoria no se cruza entre restaurantes", async () => {
    const a = await seed("atomic");
    const b = await seed("isolated");
    let calls = 0;
    const counted: MemoryGenerator = async (input, onUsage) => { calls++; return roasted(input, onUsage); };
    const now = new Date();
    const results = await Promise.all([processMemory(a, counted, config, now), processMemory(a, counted, config, now)]);
    expect(calls).toBe(1);
    expect(results).toContain("completed");
    expect(await contextOf(a)).toMatch(/verduras asadas/);
    expect(await contextOf(b)).toBe("");
  });

  it("aprobar, renombrar o cambiar el precio no invalida la memoria", async () => {
    const id = await seed("approve");
    expect(await processMemory(id, roasted, config, new Date())).toBe("completed");
    const before = await memoryOf(id);
    await prisma.recipe.update({ where: { id: `${id}-0` }, data: { state: "approved", title: "Tomate del chef", salePrice: 1600 } });
    expect((await memoryOf(id)).dirtyRevision).toBe(before.dirtyRevision);
    expect(await contextOf(id)).toMatch(/verduras asadas/);
    // Sin contexto preparado, la reconstrucción vuelve a validar las fuentes reales.
    await prisma.culinaryMemory.update({ where: { restaurantId: id }, data: { preparedContext: null } });
    expect(await contextOf(id)).toMatch(/verduras asadas/);
  });

  it("mover una receta a otro restaurante invalida a los dos y devolverla recupera la tendencia", async () => {
    const a = await seed("move-from");
    const b = await seed("move-to");
    expect(await processMemory(a, roasted, config, new Date())).toBe("completed");
    const [a0, b0] = await Promise.all([memoryOf(a), memoryOf(b)]);
    await prisma.recipe.update({ where: { id: `${a}-0` }, data: { restaurantId: b } });
    const [a1, b1] = await Promise.all([memoryOf(a), memoryOf(b)]);
    expect(a1.dirtyRevision).toBeGreaterThan(a0.dirtyRevision);
    expect(b1.dirtyRevision).toBeGreaterThan(b0.dirtyRevision);
    expect(await contextOf(a)).not.toMatch(/verduras asadas/);
    await prisma.recipe.update({ where: { id: `${a}-0` }, data: { restaurantId: a } });
    expect(await contextOf(a)).toMatch(/verduras asadas/);
  });

  it("un servidor anterior que publica sin revisión invalida el contexto y la corrección del chef se aplica al momento", async () => {
    const id = await seed("old-server");
    expect(await processMemory(id, roasted, config, new Date())).toBe("completed");
    const current = await memoryOf(id);
    const rewritten = (current.learned as Array<Record<string, unknown>>).map(fact => ({ ...fact, text: "Texto publicado por servidor anterior" }));
    await prisma.$executeRaw`UPDATE "CulinaryMemory" SET learned = ${JSON.stringify(rewritten)}::jsonb, version = version + 1 WHERE "restaurantId" = ${id}`;
    expect(await contextOf(id)).toMatch(/servidor anterior/);
    const { version } = await memoryOf(id);
    await patchCulinaryMemory(id, { expectedVersion: version, corrections: [{ key: "techniques", text: "El chef prefiere cocción al vapor" }] });
    const context = await contextOf(id);
    expect(context).toMatch(/cocción al vapor/);
    expect(context).not.toMatch(/servidor anterior/);
  });

  it("un fallo transitorio concede un único reintento a partir de 24 horas", async () => {
    const id = await seed("retry");
    const now = new Date();
    let attempts = 0;
    const unavailable: MemoryGenerator = async () => { attempts++; throw new Error("ai_provider_http_503"); };
    expect(await processMemory(id, unavailable, config, now)).toBe("failed");
    expect(+(await memoryOf(id)).retryAt!).toBe(+now + DAY);
    expect(await processMemory(id, unavailable, config, new Date(+now + DAY - 1))).toBe("skipped");
    expect(await processMemory(id, unavailable, config, new Date(+now + DAY))).toBe("failed");
    expect(await processMemory(id, unavailable, config, new Date(+now + 2 * DAY))).toBe("skipped");
    expect(attempts).toBe(2);
    expect((await memoryOf(id)).retryAt).toBeNull();
  });

  it.each<[string, boolean]>([
    ["sin respuesta del proveedor: se reintenta", false],
    ["con una respuesta ya pagada: no se reintenta", true],
  ])("recupera un trabajo abandonado %s", async (_label, paid) => {
    const id = await seed(paid ? "abandoned-paid" : "abandoned-unpaid");
    const now = new Date();
    const token = `${id}-run`;
    const startedAt = new Date(+now - 10 * 60_000);
    await prisma.culinaryMemory.update({ where: { restaurantId: id },
      data: { lockToken: token, lockExpiresAt: new Date(+now - 60_000), lastAttemptAt: startedAt, cycleStartedAt: startedAt } });
    await prisma.culinaryMemoryRun.create({ data: { id: token, restaurantId: id, provider: "fixture", model: "fixture", status: "running",
      createdAt: startedAt, cycleStartedAt: startedAt, inputTokens: paid ? 30 : 0, outputTokens: paid ? 10 : 0 } });
    await maintainMemoryRuns(now);
    const recovered = await memoryOf(id);
    expect(recovered.lockToken).toBeNull();
    expect(recovered.retryAt === null).toBe(paid);
    expect((await prisma.culinaryMemoryRun.findUniqueOrThrow({ where: { id: token } })).status).toBe("failed");
  });

  it("la limpieza de 30 días borra el texto del historial y conserva el consumo", async () => {
    const id = await seed("retention");
    const now = new Date();
    const runId = `${id}-old`;
    await prisma.culinaryMemoryRun.create({ data: { id: runId, restaurantId: id, provider: "fixture", model: "fixture", status: "completed",
      createdAt: new Date(+now - 31 * DAY), publishedTrends: [{ key: "techniques", text: "Dato antiguo" }], inputTokens: 42 } });
    await maintainMemoryRuns(now);
    const old = await prisma.culinaryMemoryRun.findUniqueOrThrow({ where: { id: runId } });
    expect(old.publishedTrends).toBeNull();
    expect(old.inputTokens).toBe(42);
  });

  it("borrar la memoria durante una generación no la revive", async () => {
    const id = await seed("erase-race");
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const ready = new Promise<void>(resolve => { started = resolve; });
    const pending = processMemory(id, async (input, onUsage) => { started(); await gate; return roasted(input, onUsage); }, config, new Date());
    await ready;
    try {
      const { version } = await memoryOf(id);
      await patchCulinaryMemory(id, { expectedVersion: version }, true);
    } finally {
      release();
    }
    expect(await pending).toBe("superseded");
    const erased = await memoryOf(id);
    expect(erased.enabled).toBe(false);
    expect(erased.learned).toEqual([]);
    expect(await publishedRuns(id)).toBe(0);
  });

  it("borrar la memoria elimina el texto del historial y conserva el registro de consumo", async () => {
    const id = await seed("erase-history");
    expect(await processMemory(id, roasted, config, new Date())).toBe("completed");
    expect(await publishedRuns(id)).toBe(1);
    const { version } = await memoryOf(id);
    await patchCulinaryMemory(id, { expectedVersion: version }, true);
    expect(await publishedRuns(id)).toBe(0);
    expect(await prisma.culinaryMemoryRun.count({ where: { restaurantId: id } })).toBe(1);
  });

  it("mandar una fuente a la papelera oculta la tendencia y restaurarla la recupera sin IA", async () => {
    const id = await seed("trash");
    expect(await processMemory(id, roasted, config, new Date())).toBe("completed");
    expect(await contextOf(id)).toMatch(/verduras asadas/);
    await prisma.recipe.update({ where: { id: `${id}-0` }, data: { deletedAt: new Date() } });
    expect(await contextOf(id)).not.toMatch(/verduras asadas/);
    await prisma.recipe.update({ where: { id: `${id}-0` }, data: { deletedAt: null } });
    expect(await contextOf(id)).toMatch(/verduras asadas/);
  });

  it.each<[string, "unchanged" | "approved" | "renamed" | "changed", boolean]>([
    ["intacta se conserva", "unchanged", true],
    ["aprobada después se conserva", "approved", true],
    ["renombrada no se acepta a ciegas", "renamed", false],
    ["con el método cambiado se descarta", "changed", false],
  ])("memoria guardada con el formato anterior: una fuente %s", async (_label, kind, survives) => {
    const { id, userId } = await restaurant(`legacy-${kind}`);
    const sources: { id: string; hash: string }[] = [];
    for (const [index, ingredient] of ["tomate", "berenjena", "calabaza"].entries()) {
      const title = `Asado de ${ingredient}`;
      const state = kind === "approved" ? "in_test" : "approved";
      const method = `Asar ${ingredient}`;
      sources.push({ id: `${id}-${index}`, hash: legacyHash(title, ingredient, method, state) });
      await prisma.recipe.create({ data: { id: `${id}-${index}`, restaurantId: id, authorId: userId, title, state,
        contentJson: { ingredients: [`200 g ${ingredient}`], method: [method] } } });
    }
    const learned = [{ key: "techniques", text: "Predominan las verduras asadas", sources }];
    await prisma.$executeRaw`INSERT INTO "CulinaryMemory" ("restaurantId", enabled, learned) VALUES (${id}, true, ${JSON.stringify(learned)}::jsonb)`;
    if (kind === "approved") await prisma.recipe.update({ where: { id: `${id}-0` }, data: { state: "approved" } });
    if (kind === "renamed") await prisma.recipe.update({ where: { id: `${id}-0` }, data: { title: "Nombre nuevo que no conserva el anterior" } });
    if (kind === "changed") await prisma.recipe.update({ where: { id: `${id}-0` }, data: { contentJson: { ingredients: ["200 g tomate"], method: ["Hervir tomate"] } } });
    expect((await contextOf(id)).includes("verduras asadas")).toBe(survives);
  });
});
