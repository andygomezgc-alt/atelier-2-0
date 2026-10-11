import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
import { IMPORT_DEADLINE_MS, IMPORT_QUIET_MS, MINIMUM_ROW_TIME_MS } from "@/lib/culinary-memory/scheduling";

const config = { provider: "fixture", model: "test" };
const t0 = new Date("2026-10-12T09:00:00Z");
const contentJson = { ingredients: ["200 g tomate"], method: ["Asar"], notes: "" };
const create = (body: Record<string, unknown>) => POST(new NextRequest("https://test.local/api/recipes", {
  method: "POST", body: JSON.stringify({ title: "Tomate asado", contentJson, ...body }), headers: { "Content-Type": "application/json" },
}));
const saved = (state: string, reused = false, importTicket: number | null = 1) =>
  saveNewRecipe.mockResolvedValue({ recipe: { id: "recipe", state }, reused, importTicket });
/** Runs what the route deferred until after the response, as Next does. */
const runAfter = async () => { for (const [task] of after.mock.calls) await (task as () => Promise<unknown>)(); };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(t0);
  vi.clearAllMocks();
  auth.mockResolvedValue({ userId: "u1", restaurantId: "r1", role: "chef_executive" });
  providerConfig.mockReturnValue(config);
  learnAfterImport.mockResolvedValue("completed");
  saved("in_test");
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

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
    vi.setSystemTime(+t0 + 5_000);
    await runAfter();
    expect(learnAfterImport).toHaveBeenCalledWith("r1", { generator: generateMemory, config, ticket: 1, deadline: +t0 + IMPORT_DEADLINE_MS });
    expect(logger.info).toHaveBeenCalledWith("culinary_memory_import_run", { restaurantId: "r1", result: "completed", elapsedMs: 5_000 });
  });

  it("anchors the deadline at the start of the request, not at the end of a slow save", async () => {
    saveNewRecipe.mockImplementation(async () => {
      vi.setSystemTime(+t0 + 40_000);
      return { recipe: { id: "recipe", state: "in_test" }, reused: false, importTicket: 3 };
    });
    await create({ origin: "import" });
    await runAfter();
    expect(learnAfterImport.mock.calls[0]![1]).toMatchObject({ ticket: 3, deadline: +t0 + IMPORT_DEADLINE_MS });
  });

  it("creates no timeout signal while handling the request", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    await create({ origin: "import" });
    expect(after).toHaveBeenCalledOnce();
    expect(timeout).not.toHaveBeenCalled();
  });

  it.each<[string, () => void, Record<string, unknown>]>([
    ["the recipe is reused by a retry", () => saved("in_test", true), { origin: "import" }],
    ["the recipe stays a draft", () => saved("draft"), { origin: "import" }],
    ["the recipe is not an import", () => saved("in_test"), {}],
    ["no provider is configured", () => providerConfig.mockReturnValue(null), { origin: "import" }],
    ["the save took no import ticket (memory off or no row)", () => saved("in_test", false, null), { origin: "import" }],
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

  it("the quiet wait, the worst save and one run fit the deadline, and the deadline fits the function", () => {
    // Worst save handler: the transaction's maxWait (10 s) plus its timeout (30 s).
    expect(IMPORT_QUIET_MS + 40_000 + MINIMUM_ROW_TIME_MS).toBeLessThanOrEqual(IMPORT_DEADLINE_MS);
    expect(IMPORT_DEADLINE_MS + 30_000).toBeLessThanOrEqual(maxDuration * 1000);
    expect(maxDuration).toBeLessThanOrEqual(300);
  });
});
