import { prisma } from "@atelier/db";
import { MemoryPreferencesSchema, MemoryKeySchema, type CulinaryMemoryResponse, type PatchCulinaryMemory, type MemoryPreference } from "@atelier/shared";
import { recipeEvidence, selectEvidence, validFacts, StoredFactsSchema, memoryContext, type StoredFact } from "./evidence";
import { memoryProviderConfig } from "./provider";

export class MemoryConflict extends Error {}
export const evidenceSelect = { id: true, title: true, state: true, contentJson: true, updatedAt: true,
  recipeIngredients: { orderBy: { position: "asc" as const }, select: { rawText: true } } } as const;

export async function loadEvidence(restaurantId: string) {
  const groups = await Promise.all(["approved", "in_test"].map(state => prisma.recipe.findMany({
    where: { restaurantId, deletedAt: null, state: state as "approved" | "in_test" },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }], take: 100, select: evidenceSelect,
  })));
  return selectEvidence(groups.flat());
}

export async function supportedFacts(restaurantId: string, stored: unknown): Promise<StoredFact[]> {
  const facts = StoredFactsSchema.safeParse(stored);
  if (!facts.success || !facts.data.length) return [];
  const ids = [...new Set(facts.data.flatMap(f => f.sources.map(s => s.id)))];
  const recipes = await prisma.recipe.findMany({ where: { id: { in: ids }, restaurantId, deletedAt: null,
    state: { in: ["approved", "in_test"] } }, select: evidenceSelect });
  return validFacts(facts.data, recipes.map(recipeEvidence));
}

export const correctionsOf = (value: unknown): MemoryPreference[] => MemoryPreferencesSchema.safeParse(value).data ?? [];
export const exclusionsOf = (value: string[]) => value.flatMap(key => { const p = MemoryKeySchema.safeParse(key); return p.success ? [p.data] : []; });

export async function getCulinaryMemory(restaurantId: string, canEdit: boolean): Promise<CulinaryMemoryResponse> {
  const [restaurant, memory] = await Promise.all([
    prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { identityLine: true } }),
    prisma.culinaryMemory.findUnique({ where: { restaurantId } }),
  ]);
  const learned = memory ? await supportedFacts(restaurantId, memory.learned) : [];
  return { restaurantId, identityLine: restaurant.identityLine, version: memory?.version ?? 0, enabled: memory?.enabled ?? false,
    learned: learned.map(({ key, text }) => ({ key, text })), corrections: correctionsOf(memory?.corrections),
    excludedKeys: exclusionsOf(memory?.excludedKeys ?? []), updatedAt: memory?.updatedAt?.toISOString() ?? null, canEdit, learningAvailable: !!memoryProviderConfig() };
}

export async function patchCulinaryMemory(restaurantId: string, patch: PatchCulinaryMemory, erase = false) {
  await prisma.$transaction(async tx => {
    await tx.culinaryMemory.upsert({ where: { restaurantId }, create: { restaurantId }, update: {} });
    const changed = await tx.culinaryMemory.updateMany({ where: { restaurantId, version: patch.expectedVersion }, data: {
      version: { increment: 1 }, dirtyRevision: { increment: 1 }, lockToken: null, lockExpiresAt: null, nextCheckAt: new Date(),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      ...(patch.corrections !== undefined ? { corrections: patch.corrections } : {}),
      ...(patch.excludedKeys !== undefined ? { excludedKeys: patch.excludedKeys } : {}),
      ...(erase ? { enabled: false, learned: [], corrections: [], excludedKeys: [], inputHash: null, updatedAt: null } : {}),
    } });
    if (!changed.count) throw new MemoryConflict();
    if (patch.identityLine !== undefined) await tx.restaurant.update({ where: { id: restaurantId }, data: { identityLine: patch.identityLine || null } });
  });
  return getCulinaryMemory(restaurantId, true);
}

/** null = modo anterior; cadena vacía = memoria activada pero aún sin tendencias. */
export async function chatMemory(restaurantId: string): Promise<string | null> {
  const memory = await prisma.culinaryMemory.findUnique({ where: { restaurantId } });
  if (!memory?.enabled) return null;
  const facts = await supportedFacts(restaurantId, memory.learned);
  // Una edición/desactivación concurrente invalida este snapshot.
  const current = await prisma.culinaryMemory.findUnique({ where: { restaurantId }, select: { enabled: true, version: true } });
  if (!current?.enabled || current.version !== memory.version) return "";
  return memoryContext(correctionsOf(memory.corrections), facts, memory.excludedKeys);
}
