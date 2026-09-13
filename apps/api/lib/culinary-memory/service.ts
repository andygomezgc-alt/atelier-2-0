import { Prisma, prisma } from "@atelier/db";
import { MemoryPreferencesSchema, MemoryKeySchema, type CulinaryMemoryResponse, type PatchCulinaryMemory, type MemoryPreference } from "@atelier/shared";
import { assessFacts, recipeEvidence, selectEvidence, StoredFactsSchema, memoryContext, type StoredFact } from "./evidence";
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

async function supportedFactState(restaurantId: string, stored: unknown): Promise<{ valid: StoredFact[]; migrated: StoredFact[] | null }> {
  const facts = StoredFactsSchema.safeParse(stored);
  if (!facts.success) return { valid: [], migrated: null };
  if (!facts.data.length) return { valid: [], migrated: [] };
  const ids = [...new Set(facts.data.flatMap(f => f.sources.map(s => s.id)))];
  const recipes = await prisma.recipe.findMany({ where: { id: { in: ids }, restaurantId, deletedAt: null,
    state: { in: ["approved", "in_test"] } }, select: evidenceSelect });
  return assessFacts(facts.data, recipes.map(recipeEvidence));
}

export async function supportedFacts(restaurantId: string, stored: unknown): Promise<StoredFact[]> {
  return (await supportedFactState(restaurantId, stored)).valid;
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
      preparedContext: null, preparedRevision: -1, preparedVersion: -1, retryAt: null,
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      ...(patch.corrections !== undefined ? { corrections: patch.corrections } : {}),
      ...(patch.excludedKeys !== undefined ? { excludedKeys: patch.excludedKeys } : {}),
      ...(erase ? { enabled: false, learned: [], corrections: [], excludedKeys: [], inputHash: null, updatedAt: null } : {}),
    } });
    if (!changed.count) throw new MemoryConflict();
    if (erase) await tx.culinaryMemoryRun.updateMany({ where: { restaurantId }, data: { publishedTrends: Prisma.DbNull } });
    if (patch.identityLine !== undefined) await tx.restaurant.update({ where: { id: restaurantId }, data: { identityLine: patch.identityLine || null } });
  });
  return getCulinaryMemory(restaurantId, true);
}

const chatMemorySelect = {
  enabled: true, version: true, dirtyRevision: true,
  preparedContext: true, preparedRevision: true, preparedVersion: true,
  learned: true, corrections: true, excludedKeys: true,
} as const;

/** null = usar títulos recientes; cadena vacía = snapshot válido sin preferencias. */
export async function chatMemory(restaurantId: string): Promise<string | null> {
  const memory = await prisma.culinaryMemory.findUnique({ where: { restaurantId }, select: chatMemorySelect });
  if (!memory?.enabled) return null;
  if (memory.preparedContext !== null && memory.preparedRevision === memory.dirtyRevision && memory.preparedVersion === memory.version) {
    return memory.preparedContext;
  }
  const facts = await supportedFactState(restaurantId, memory.learned);
  const context = memoryContext(correctionsOf(memory.corrections), facts.valid, exclusionsOf(memory.excludedKeys));
  const saved = await prisma.culinaryMemory.updateMany({
    where: { restaurantId, enabled: true, version: memory.version, dirtyRevision: memory.dirtyRevision },
    data: {
      ...(facts.migrated ? { learned: facts.migrated } : {}),
      preparedContext: context,
      preparedRevision: memory.dirtyRevision,
      preparedVersion: memory.version,
    },
  });
  if (saved.count) return context;

  // Una publicación, edición o fuente modificada durante la reconstrucción
  // invalida ambos contadores. Sólo se usa el snapshot nuevo si ya está listo.
  const current = await prisma.culinaryMemory.findUnique({ where: { restaurantId }, select: chatMemorySelect });
  if (!current?.enabled || current.preparedContext === null || current.preparedRevision !== current.dirtyRevision || current.preparedVersion !== current.version) return "";
  return current.preparedContext;
}
