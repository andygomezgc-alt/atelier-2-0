import { beforeEach, describe, expect, it, vi } from "vitest";
const { db, loadEvidence } = vi.hoisted(() => ({
  db: { culinaryMemory: { findUnique: vi.fn(), updateMany: vi.fn() }, culinaryMemoryRun: { create: vi.fn(), update: vi.fn(), updateMany: vi.fn() }, $transaction: vi.fn() },
  loadEvidence: vi.fn(),
}));
vi.mock("@atelier/db", () => ({ prisma: db }));
vi.mock("./service", () => ({ loadEvidence, correctionsOf: (v: unknown) => v ?? [] }));
import { processMemory } from "./worker";
const now = new Date("2026-09-08T12:00:00Z");
const config = { model: "test", provider: "fixture", key: "test" };
const evidence = [1, 2, 3].map(n => ({ id: String(n), hash: `h${n}`, duplicateKey: `d${n}`, state: "approved", title: "Recipe", ingredients: [], method: [] }));
const memory = () => ({ restaurantId: "r1", enabled: true, version: 1, dirtyRevision: 2, checkedRevision: 1, corrections: [], excludedKeys: [], inputHash: null,
  lockExpiresAt: null, lastAttemptAt: null, restaurant: { identityLine: null, languageDefault: "es" } });
beforeEach(() => {
  vi.clearAllMocks();
  db.culinaryMemory.findUnique.mockResolvedValue(memory());
  db.culinaryMemory.updateMany.mockReset().mockResolvedValue({ count: 1 });
  db.$transaction.mockImplementation((fn: (tx: typeof db) => unknown) => fn(db));
  loadEvidence.mockReset().mockResolvedValue(evidence);
});
describe("weekly memory worker", () => {
  it("no reserva ni llama si faltan proveedor, fuentes o novedades", async () => {
    const generate = vi.fn();
    expect(await processMemory("r1", generate, null, now)).toBe("unconfigured");
    loadEvidence.mockResolvedValueOnce(evidence.slice(0, 2));
    expect(await processMemory("r1", generate, config, now)).toBe("unchanged");
    db.culinaryMemory.findUnique.mockResolvedValueOnce({ ...memory(), checkedRevision: 2 });
    expect(await processMemory("r1", generate, config, now)).toBe("unchanged");
    expect(generate).not.toHaveBeenCalled(); expect(db.culinaryMemoryRun.create).not.toHaveBeenCalled();
  });
  it("un fallo reciente también ocupa la semana", async () => {
    db.culinaryMemory.findUnique.mockResolvedValue({ ...memory(), lastAttemptAt: new Date(+now - 86400000) });
    const generate = vi.fn(); expect(await processMemory("r1", generate, config, now)).toBe("skipped");
    expect(generate).not.toHaveBeenCalled();
  });
  it("no gasta tokens cuando el chef ya corrigió u omitió todas las categorías", async () => {
    db.culinaryMemory.findUnique.mockResolvedValue({ ...memory(), corrections: [{ key: "cuisine", text: "Cocina vegetal" }],
      excludedKeys: ["ingredients", "techniques", "flavours", "textures", "presentation", "complexity"] });
    const generate = vi.fn();
    expect(await processMemory("r1", generate, config, now)).toBe("unchanged");
    expect(generate).not.toHaveBeenCalled();
    expect(db.culinaryMemoryRun.create).not.toHaveBeenCalled();
  });
  it("un fallo conserva el contenido previo y no reintenta", async () => {
    const generate = vi.fn().mockRejectedValue(new Error("secret provider body"));
    expect(await processMemory("r1", generate, config, now)).toBe("failed");
    expect(generate).toHaveBeenCalledTimes(1);
    expect(db.culinaryMemory.updateMany.mock.calls.some(([x]) => "learned" in x.data)).toBe(false);
    expect(db.culinaryMemoryRun.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ errorCode: "memory_generation_failed" }) }));
  });
  it("rechaza fuentes inventadas y referencias repetidas", async () => {
    for (const sources of [[1, 2, 99], [1, 1, 2]]) {
      expect(await processMemory("r1", vi.fn().mockResolvedValue({ trends: [{ key: "cuisine", text: "Tendencia", sources }] }), config, now)).toBe("failed");
    }
    expect(db.culinaryMemory.updateMany.mock.calls.some(([x]) => "learned" in x.data)).toBe(false);
  });
  it("ignora categorías corregidas o excluidas y vincula las fuentes verificadas", async () => {
    db.culinaryMemory.findUnique.mockResolvedValue({ ...memory(), corrections: [{ key: "cuisine", text: "Vegetal" }], excludedKeys: ["ingredients"] });
    const generate = vi.fn().mockResolvedValue({ trends: ["cuisine", "ingredients", "techniques"].map(key => ({ key, text: "Tendencia", sources: [1, 2, 3] })) });
    expect(await processMemory("r1", generate, config, now)).toBe("completed");
    const update = db.culinaryMemory.updateMany.mock.calls.find(([x]) => "learned" in x.data)![0];
    expect(update.data.learned).toEqual([{ key: "techniques", text: "Tendencia", sources: evidence.map(e => ({ id: e.id, hash: e.hash })) }]);
    expect(update.where).toMatchObject({ restaurantId: "r1", version: 1, dirtyRevision: 2, lockToken: expect.any(String) });
  });
  it("no publica si el chef editó durante la generación", async () => {
    db.culinaryMemory.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    expect(await processMemory("r1", vi.fn().mockResolvedValue({ trends: [] }), config, now)).toBe("superseded");
  });
});
