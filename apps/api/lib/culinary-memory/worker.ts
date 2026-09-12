import { randomUUID } from "node:crypto";
import { prisma } from "@atelier/db";
import { MemoryKeySchema } from "@atelier/shared";
import { loadEvidence, correctionsOf } from "./service";
import { evidenceHash, type StoredFact } from "./evidence";
import { generateMemory, memoryProviderConfig, type MemoryGenerator } from "./provider";
const WEEK = 7 * 24 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

export async function processMemory(restaurantId: string, generator: MemoryGenerator = generateMemory,
  config = memoryProviderConfig(), now = new Date()): Promise<string> {
  if (!config) return "unconfigured";
  const memory = await prisma.culinaryMemory.findUnique({ where: { restaurantId }, include: { restaurant: { select: { identityLine: true, languageDefault: true } } } });
  if (!memory?.enabled) return "skipped";
  if (memory.lastAttemptAt && +now - +memory.lastAttemptAt < WEEK) {
    await prisma.culinaryMemory.updateMany({ where: { restaurantId, version: memory.version }, data: { nextCheckAt: new Date(+memory.lastAttemptAt + WEEK) } });
    return "skipped";
  }
  if (memory.lockExpiresAt && memory.lockExpiresAt > now) return "skipped";
  if (memory.checkedRevision === memory.dirtyRevision) {
    await prisma.culinaryMemory.updateMany({ where: { restaurantId, version: memory.version }, data: { nextCheckAt: new Date(+now + DAY) } });
    return "unchanged";
  }
  const evidence = await loadEvidence(restaurantId);
  const corrections = correctionsOf(memory.corrections);
  const excluded = new Set([...memory.excludedKeys, ...corrections.map(c => c.key)]);
  const hash = evidenceHash(evidence, memory.restaurant.identityLine, corrections, memory.excludedKeys);
  const snapshot = { restaurantId, enabled: true, version: memory.version, dirtyRevision: memory.dirtyRevision };
  if (evidence.length < 3 || hash === memory.inputHash || MemoryKeySchema.options.every(key => excluded.has(key))) {
    await prisma.culinaryMemory.updateMany({ where: snapshot, data: { checkedRevision: memory.dirtyRevision, nextCheckAt: new Date(+now + DAY) } });
    return "unchanged";
  }
  const token = randomUUID();
  const claimed = await prisma.$transaction(async tx => {
    const result = await tx.culinaryMemory.updateMany({ where: { ...snapshot,
      AND: [{ OR: [{ lastAttemptAt: null }, { lastAttemptAt: { lte: new Date(+now - WEEK) } }] },
        { OR: [{ lockExpiresAt: null }, { lockExpiresAt: { lte: now } }] }] },
      data: { lockToken: token, lockExpiresAt: new Date(+now + 120_000), lastAttemptAt: now, nextCheckAt: new Date(+now + WEEK) } });
    if (!result.count) return false;
    await tx.culinaryMemoryRun.create({ data: { id: token, restaurantId, provider: config.provider, model: config.model, status: "running" } });
    return true;
  });
  if (!claimed) return "busy";
  try {
    const result = await generator({ evidence, identity: memory.restaurant.identityLine, corrections, excluded: memory.excludedKeys,
      language: memory.restaurant.languageDefault }, async usage => {
      await prisma.culinaryMemoryRun.update({ where: { id: token }, data: usage });
    });
    const keys = new Set<string>();
    const learned: StoredFact[] = [];
    for (const trend of result.trends) {
      if (excluded.has(trend.key) || keys.has(trend.key)) continue;
      const refs = [...new Set(trend.sources)];
      if (refs.length < 3 || refs.some(ref => !evidence[ref - 1])) throw new Error("memory_sources_invalid");
      keys.add(trend.key);
      learned.push({ key: trend.key, text: trend.text, sources: refs.map(ref => ({ id: evidence[ref - 1]!.id, hash: evidence[ref - 1]!.hash })) });
    }
    // Verificar de nuevo las fuentes: nada generado puede revivir una receta eliminada.
    const latest = await loadEvidence(restaurantId);
    if (evidenceHash(latest, memory.restaurant.identityLine, corrections, memory.excludedKeys) !== hash) throw new Error("memory_sources_changed");
    const status = await prisma.$transaction(async tx => {
      const saved = await tx.culinaryMemory.updateMany({ where: { ...snapshot, lockToken: token }, data: {
        learned, inputHash: hash, checkedRevision: memory.dirtyRevision, updatedAt: now, version: { increment: 1 }, lockToken: null, lockExpiresAt: null,
      } });
      const status = saved.count ? "completed" : "superseded";
      await tx.culinaryMemoryRun.update({ where: { id: token }, data: { status, finishedAt: new Date() } });
      return status;
    });
    return status;
  } catch (error) {
    await prisma.culinaryMemoryRun.updateMany({ where: { id: token }, data: { status: "failed", finishedAt: new Date(),
      errorCode: error instanceof Error && /^memory_[a-z0-9_]+$/.test(error.message) ? error.message : "memory_generation_failed" } });
    return "failed";
  } finally {
    await prisma.culinaryMemory.updateMany({ where: { restaurantId, lockToken: token }, data: { lockToken: null, lockExpiresAt: null } });
  }
}
