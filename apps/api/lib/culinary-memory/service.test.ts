import { beforeEach, describe, expect, it, vi } from "vitest";

const { db } = vi.hoisted(() => ({
  db: {
    culinaryMemory: { findUnique: vi.fn(), upsert: vi.fn(), updateMany: vi.fn() },
    culinaryMemoryRun: { updateMany: vi.fn() },
    restaurant: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
    recipe: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("@atelier/db", () => ({ prisma: db, Prisma: { DbNull: "DB_NULL" } }));

import { recipeEvidence } from "./evidence";
import { chatMemory, patchCulinaryMemory } from "./service";

const recipe = (id: string) => ({ id, title: id, state: "approved", updatedAt: new Date(),
  contentJson: { ingredients: [`200 g ${id}`], method: [`Asar ${id}`] }, recipeIngredients: [] });
const evidence = ["a", "b", "c"].map(id => recipeEvidence(recipe(id)));
const learned = [{ key: "techniques", text: "Predominan asados", sources: evidence.map(e => ({ id: e.id, hash: e.hash, version: 2 })) }];
const memory = (extra = {}) => ({ restaurantId: "r1", enabled: true, version: 4, dirtyRevision: 7,
  preparedRevision: 6, preparedVersion: 3, preparedContext: null, learned, corrections: [], excludedKeys: [], ...extra });

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation((fn: (tx: typeof db) => unknown) => fn(db));
  db.culinaryMemory.findUnique.mockResolvedValue(memory());
  db.culinaryMemory.updateMany.mockResolvedValue({ count: 1 });
  db.recipe.findMany.mockResolvedValue(["a", "b", "c"].map(recipe));
  db.restaurant.findUniqueOrThrow.mockResolvedValue({ identityLine: null });
});

describe("prepared culinary memory", () => {
  it("uses one light read when the prepared revision is current", async () => {
    db.culinaryMemory.findUnique.mockResolvedValue(memory({ preparedRevision: 7, preparedVersion: 4, preparedContext: "contexto listo" }));
    expect(await chatMemory("r1")).toBe("contexto listo");
    expect(db.culinaryMemory.findUnique).toHaveBeenCalledTimes(1);
    expect(db.recipe.findMany).not.toHaveBeenCalled();
    expect(db.culinaryMemory.updateMany).not.toHaveBeenCalled();
  });

  it("invalidates a cache when a legacy server increments version without dirtyRevision", async () => {
    db.culinaryMemory.findUnique.mockResolvedValue(memory({ preparedRevision: 7, preparedVersion: 3, preparedContext: "contexto anterior" }));
    expect(await chatMemory("r1")).toContain("Predominan asados");
    expect(db.recipe.findMany).toHaveBeenCalledTimes(1);
    expect(db.culinaryMemory.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ preparedVersion: 4 }) }));
  });

  it("rebuilds deterministically, migrates verified facts and persists with both revisions", async () => {
    const legacy = learned.map(f => ({ ...f, sources: evidence.map(e => ({ id: e.id, hash: e.legacyHashes.approved })) }));
    db.culinaryMemory.findUnique.mockResolvedValue(memory({ learned: legacy }));
    const context = await chatMemory("r1");
    expect(context).toContain("Predominan asados");
    expect(db.recipe.findMany).toHaveBeenCalledTimes(1);
    expect(db.culinaryMemory.updateMany).toHaveBeenCalledWith({
      where: { restaurantId: "r1", enabled: true, version: 4, dirtyRevision: 7 },
      data: expect.objectContaining({ preparedRevision: 7, preparedVersion: 4, preparedContext: expect.stringContaining("Predominan asados"), learned }),
    });
  });

  it("does not return a prepared snapshot if dirtyRevision changes during rebuild", async () => {
    db.culinaryMemory.findUnique
      .mockResolvedValueOnce(memory())
      .mockResolvedValueOnce(memory({ dirtyRevision: 8, preparedRevision: 7, preparedVersion: 4, preparedContext: "stale" }));
    db.culinaryMemory.updateMany.mockResolvedValue({ count: 0 });
    expect(await chatMemory("r1")).toBe("");
    expect(db.culinaryMemory.findUnique).toHaveBeenCalledTimes(2);
  });

  it("recovers a trend after an unchanged source leaves the trash without AI", async () => {
    db.culinaryMemory.findUnique
      .mockResolvedValueOnce(memory({ dirtyRevision: 8, preparedRevision: 7, preparedVersion: 4 }))
      .mockResolvedValueOnce(memory({ dirtyRevision: 9, preparedRevision: 8, preparedVersion: 4 }));
    db.recipe.findMany
      .mockResolvedValueOnce(["a", "b"].map(recipe))
      .mockResolvedValueOnce(["a", "b", "c"].map(recipe));
    expect(await chatMemory("r1")).toBe("");
    expect(db.culinaryMemory.updateMany.mock.calls[0]![0].data.learned).toEqual(learned);
    expect(await chatMemory("r1")).toContain("Predominan asados");
    expect(db.culinaryMemory.updateMany).toHaveBeenCalledTimes(2);
  });
});

describe("memory deletion", () => {
  it("removes prepared and historical trend content in the same transaction", async () => {
    db.culinaryMemory.findUnique.mockResolvedValue(memory({ enabled: false, learned: [], corrections: [], excludedKeys: [] }));
    await patchCulinaryMemory("r1", { expectedVersion: 4 }, true);
    expect(db.culinaryMemory.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      learned: [], preparedContext: null, preparedRevision: -1, preparedVersion: -1, enabled: false,
    }) }));
    expect(db.culinaryMemoryRun.updateMany).toHaveBeenCalledWith({ where: { restaurantId: "r1" }, data: { publishedTrends: "DB_NULL" } });
    expect(db.culinaryMemory.updateMany.mock.invocationCallOrder[0]).toBeLessThan(db.culinaryMemoryRun.updateMany.mock.invocationCallOrder[0]!);
  });
});
