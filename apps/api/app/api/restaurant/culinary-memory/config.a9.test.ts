import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { CulinaryMemory } from "@atelier/db";

const { db, after, processMemory, logger } = vi.hoisted(() => ({
  db: {
    culinaryMemory: { findUnique: vi.fn(), upsert: vi.fn(), updateMany: vi.fn() },
    culinaryMemoryRun: { updateMany: vi.fn() },
    restaurant: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
    recipe: { findMany: vi.fn() }, $transaction: vi.fn(),
  },
  after: vi.fn(), processMemory: vi.fn(), logger: { error: vi.fn(), info: vi.fn() },
}));
vi.mock("@atelier/db", () => ({ prisma: db, Prisma: { DbNull: "DB_NULL" } }));
vi.mock("next/server", async original => ({ ...(await original<typeof import("next/server")>()), after }));
vi.mock("@/lib/permissions-guard", () => ({
  requireAuth: vi.fn().mockResolvedValue({ restaurantId: "mine", role: "admin", userId: "u1" }),
  isNextResponse: (value: unknown) => value instanceof Response,
}));
vi.mock("@/lib/culinary-memory/worker", () => ({ processMemory }));
vi.mock("@/lib/logger", () => ({ logger }));
// Keep the real service, provider and aiConfig: a mocked config cannot reproduce
// the throw after PATCH/DELETE have already committed their privacy changes.

let memory: CulinaryMemory;
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("ZAI_API_KEY", "fixture-key");
  vi.stubEnv("CULINARY_MEMORY_MODEL", "");
  vi.stubEnv("AI_GLM_MODEL", "");
  memory = {
    restaurantId: "mine", enabled: false, version: 0, learned: [], corrections: [], excludedKeys: [],
    inputHash: null, lastFailedInputHash: null, failureCount: null, lastFailedAt: null, discardStreak: 0,
    preparedContext: null, preparedRevision: -1, preparedVersion: -1,
    dirtyRevision: 0, checkedRevision: -1, nextCheckAt: new Date(), lastAttemptAt: null,
    cycleStartedAt: null, retryAt: null, updatedAt: null, lockToken: null, lockExpiresAt: null,
  };
  db.culinaryMemory.findUnique.mockImplementation(async () => structuredClone(memory));
  db.culinaryMemory.upsert.mockImplementation(async () => structuredClone(memory));
  db.culinaryMemory.updateMany.mockImplementation(async ({ where, data }) => {
    if (where.version !== memory.version) return { count: 0 };
    for (const [key, value] of Object.entries(data)) {
      Reflect.set(memory, key, value && typeof value === "object" && "increment" in value
        ? Number(Reflect.get(memory, key)) + Number(value.increment) : value);
    }
    return { count: 1 };
  });
  db.culinaryMemoryRun.updateMany.mockResolvedValue({ count: 1 });
  db.restaurant.findUniqueOrThrow.mockResolvedValue({ identityLine: "Seasonal cooking" });
  db.recipe.findMany.mockResolvedValue([]);
  db.$transaction.mockImplementation((fn: (tx: typeof db) => Promise<unknown>) => fn(db));
});
afterEach(() => { vi.unstubAllEnvs(); });

function request(method: string, body?: unknown) {
  return new NextRequest("http://local/api/restaurant/culinary-memory", {
    method, headers: { authorization: "Bearer fixture", "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe("A9 memory sheet with malformed model configuration", () => {
  const mutations = ["CULINARY_MEMORY_MODEL", "AI_GLM_MODEL"].flatMap(variable => ["PATCH", "DELETE"].map(method => [variable, method]));
  it.each(mutations)("returns a successful committed privacy response with invalid %s on %s", async (variable, method) => {
    vi.stubEnv(variable!, "zai/glm-5.3-flash");
    const { PATCH, DELETE } = await import("./route");
    const pending = method === "PATCH"
      ? PATCH(request("PATCH", { expectedVersion: 0, enabled: true }))
      : DELETE(request("DELETE", { expectedVersion: 0 }));
    await expect(pending).resolves.toMatchObject({ status: 200 });
    expect(memory.version).toBe(1);
    expect(memory.enabled).toBe(method === "PATCH");
    expect(logger.error).toHaveBeenCalledOnce();
    expect(after).not.toHaveBeenCalled();
    expect(processMemory).not.toHaveBeenCalled();
  });

  it.each(["CULINARY_MEMORY_MODEL", "AI_GLM_MODEL"])("keeps GET, PATCH and DELETE working with invalid %s and logs once", async variable => {
    vi.stubEnv(variable, "zai/glm-5.3-flash");
    const { GET, PATCH, DELETE } = await import("./route");
    const get = await GET(request("GET"));
    expect(get.status).toBe(200);
    expect(await get.json()).toMatchObject({ learningAvailable: false, canEdit: true, enabled: false, version: 0 });

    const patch = await PATCH(request("PATCH", { expectedVersion: 0, enabled: true, corrections: [{ key: "techniques", text: "Prefer roasting" }] }));
    expect(patch.status).toBe(200);
    expect(await patch.json()).toMatchObject({ learningAvailable: false, enabled: true, version: 1 });
    expect(memory.enabled).toBe(true);
    expect(memory.corrections).toEqual([{ key: "techniques", text: "Prefer roasting" }]);

    const erase = await DELETE(request("DELETE", { expectedVersion: 1 }));
    expect(erase.status).toBe(200);
    expect(await erase.json()).toMatchObject({ learningAvailable: false, enabled: false, learned: [], corrections: [], excludedKeys: [], version: 2 });
    expect(memory).toMatchObject({ enabled: false, learned: [], corrections: [], inputHash: null });
    expect(db.culinaryMemoryRun.updateMany).toHaveBeenCalledWith({ where: { restaurantId: "mine" }, data: { publishedTrends: "DB_NULL" } });
    expect(after).not.toHaveBeenCalled();
    expect(processMemory).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledOnce();
  });
});
