import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { auth, saveNewRecipe, after, learnAfterImport, providerConfig, generateMemory, logger } = vi.hoisted(() => ({
  auth: vi.fn(), saveNewRecipe: vi.fn(), after: vi.fn(), learnAfterImport: vi.fn(), providerConfig: vi.fn(),
  generateMemory: vi.fn(), logger: { info: vi.fn(), error: vi.fn() },
}));
vi.mock("next/server", async importOriginal => ({ ...(await importOriginal<typeof import("next/server")>()), after }));
vi.mock("@atelier/db", () => ({ prisma: {} }));
vi.mock("@/lib/permissions-guard", () => ({ requireAuth: auth, isNextResponse: (v: unknown) => v instanceof Response }));
vi.mock("@/lib/create-recipe", () => ({ saveNewRecipe }));
vi.mock("@/lib/projections", () => ({ projectRecipeListItem: (recipe: unknown) => recipe, recipeListInclude: {} }));
vi.mock("@/lib/culinary-memory/worker", () => ({ learnAfterImport }));
vi.mock("@/lib/culinary-memory/provider", () => ({ memoryProviderConfig: providerConfig, generateMemory }));
vi.mock("@/lib/logger", () => ({ logger }));
import { POST, maxDuration } from "../route";
import { MINIMUM_ROW_TIME_MS } from "@/lib/culinary-memory/scheduling";

const config = { provider: "fixture", model: "test" };
const contentJson = { ingredients: ["200 g tomate"], method: ["Asar"], notes: "" };
const create = (body: Record<string, unknown>) => POST(new NextRequest("https://test.local/api/recipes", {
  method: "POST", body: JSON.stringify({ title: "Tomate asado", contentJson, ...body }), headers: { "Content-Type": "application/json" },
}));
const saved = (state: string, reused = false) => saveNewRecipe.mockResolvedValue({ recipe: { id: "recipe", state }, reused });
/** Runs what the route deferred until after the response, as Next does. */
const runAfter = async () => { for (const [task] of after.mock.calls) await (task as () => Promise<unknown>)(); };

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ userId: "u1", restaurantId: "r1", role: "chef_executive" });
  providerConfig.mockReturnValue(config);
  learnAfterImport.mockResolvedValue("completed");
  saved("in_test");
});

describe("learning right after an imported recipe", () => {
  it("passes the saver's role so the state can be decided", async () => {
    await create({ origin: "import" });
    expect(saveNewRecipe).toHaveBeenCalledWith("r1", "u1", expect.objectContaining({ origin: "import" }), "chef_executive");
  });

  it.each(["in_test", "approved"])("a new %s import learns after responding", async state => {
    saved(state);
    const response = await create({ origin: "import" });
    expect(response.status).toBe(201);
    expect(after).toHaveBeenCalledOnce();
    expect(learnAfterImport).not.toHaveBeenCalled();
    await runAfter();
    expect(learnAfterImport).toHaveBeenCalledWith("r1", { generator: generateMemory, config, signal: expect.any(AbortSignal) });
    expect((learnAfterImport.mock.calls[0]![1].signal as AbortSignal).aborted).toBe(false);
    expect(logger.info).toHaveBeenCalledWith("culinary_memory_import_run", expect.objectContaining({ restaurantId: "r1", result: "completed" }));
  });

  it.each<[string, () => void, Record<string, unknown>]>([
    ["the recipe is reused by a retry", () => saved("in_test", true), { origin: "import" }],
    ["the recipe stays a draft", () => saved("draft"), { origin: "import" }],
    ["the recipe is not an import", () => saved("in_test"), {}],
    ["no provider is configured", () => providerConfig.mockReturnValue(null), { origin: "import" }],
  ])("does not learn when %s", async (_label, arrange, body) => {
    arrange();
    expect((await create(body)).status).toBeLessThan(300);
    await runAfter();
    expect(after).not.toHaveBeenCalled();
    expect(learnAfterImport).not.toHaveBeenCalled();
  });

  it("a learning failure does not change the response and is logged", async () => {
    const failure = new Error("database unavailable");
    learnAfterImport.mockRejectedValue(failure);
    expect((await create({ origin: "import" })).status).toBe(201);
    await expect(runAfter()).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith("culinary_memory_import_run_failed", expect.objectContaining({ restaurantId: "r1", error: failure }));
  });

  it("the function lasts long enough for one run and its final margin", () => {
    expect(maxDuration * 1000).toBeGreaterThanOrEqual(MINIMUM_ROW_TIME_MS + 30_000);
    expect(maxDuration).toBeLessThanOrEqual(300);
  });
});
