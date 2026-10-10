import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { selectEvidence, type Evidence, type EvidenceRecipe } from "./evidence";
import type { MemoryInput } from "./provider";

const { logger, reserveGeneration } = vi.hoisted(() => ({
  logger: { error: vi.fn(), info: vi.fn() }, reserveGeneration: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({ logger }));
vi.mock("../ai/budget", () => ({ reserveGeneration, settleGeneration: vi.fn() }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("ZAI_API_KEY", "fixture-key");
  vi.stubEnv("CULINARY_MEMORY_MODEL", "");
  vi.stubEnv("AI_GLM_MODEL", "");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const evidenceOf = (n: number, escaped = false): Evidence => ({
  id: `recipe-${n}`, hash: `hash-${n}`, duplicateKey: `distinct-${n}`,
  legacyHashes: { approved: `a-${n}`, in_test: `t-${n}` }, state: "approved",
  title: `Recipe ${n} ` + (escaped ? '"' : "t").repeat(120),
  ingredients: [(escaped ? "\\" : "i").repeat(300)],
  method: [(escaped ? '"' : "m").repeat(320)],
});
const inputOf = (evidence: Evidence[]): MemoryInput => ({
  evidence, identity: null, corrections: [], excluded: [], language: "en",
});
interface PayloadRecipe { ref: number; title: string; ingredients: string; method: string }
interface Payload { recipes: PayloadRecipe[]; language: string }

describe("A9 memory provider configuration", () => {
  it.each(["CULINARY_MEMORY_MODEL", "AI_GLM_MODEL"])("returns null and logs once for malformed %s without network or budget work", async variable => {
    vi.stubEnv(variable, "zai/glm-5.3-flash");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const { memoryProviderConfig } = await import("./provider");
    expect(memoryProviderConfig()).toBeNull();
    expect(memoryProviderConfig()).toBeNull();
    expect(memoryProviderConfig()).toBeNull();
    expect(logger.error).toHaveBeenCalledOnce();
    expect(fetcher).not.toHaveBeenCalled();
    expect(reserveGeneration).not.toHaveBeenCalled();
  });

  it("can use corrected configuration after a malformed value instead of caching unavailability", async () => {
    vi.stubEnv("CULINARY_MEMORY_MODEL", "zai/glm-5.3-flash");
    const { memoryProviderConfig } = await import("./provider");
    expect(memoryProviderConfig()).toBeNull();
    vi.stubEnv("CULINARY_MEMORY_MODEL", "glm-5.3-flash");
    expect(memoryProviderConfig()).toMatchObject({ provider: "zai", model: "glm-5.3-flash" });
    expect(logger.error).toHaveBeenCalledOnce();
  });
});

describe("A9 bounded memory evidence payload", () => {
  it("drops oldest evidence until oversized input fits and keeps source references stable", async () => {
    const { memoryPayload } = await import("./provider");
    // Evidence is ordered newest first; every recipe has maximal plain-text extracts.
    const evidence = Array.from({ length: 35 }, (_, index) => evidenceOf(index + 1));
    const input = inputOf(evidence);
    const before = structuredClone(input);
    const serialized = memoryPayload(input);
    const payload = JSON.parse(serialized) as Payload;
    expect(serialized.length).toBeLessThanOrEqual(20_000);
    expect(payload.recipes.length).toBeGreaterThanOrEqual(2);
    expect(payload.recipes.length).toBeLessThan(evidence.length);
    expect(payload.recipes.map(recipe => recipe.ref)).toEqual(payload.recipes.map((_, index) => index + 1));
    expect(payload.recipes[0]!.title).toBe(evidence[0]!.title.slice(0, 120));
    expect(payload.recipes.at(-1)!.title).toBe(evidence[payload.recipes.length - 1]!.title.slice(0, 120));
    expect(payload.recipes.some(recipe => recipe.title === evidence.at(-1)!.title.slice(0, 120))).toBe(false);
    expect(input).toEqual(before);
  });

  it("trims JSON-expanded input instead of rejecting otherwise bounded culinary extracts", async () => {
    const { memoryPayload } = await import("./provider");
    const evidence = Array.from({ length: 20 }, (_, index) => evidenceOf(index + 1, true));
    const serialized = memoryPayload(inputOf(evidence));
    const payload = JSON.parse(serialized) as Payload;
    expect(serialized.length).toBeLessThanOrEqual(20_000);
    expect(payload.recipes.length).toBeGreaterThanOrEqual(2);
    expect(payload.recipes.length).toBeLessThan(20);
    expect(payload.recipes.reduce((total, r) => total + r.title.length + r.ingredients.length + r.method.length, 0)).toBeLessThan(20_000);
    expect(payload.recipes[0]).toMatchObject({ ref: 1, ingredients: "\\".repeat(300), method: '"'.repeat(320) });
  });

  it("drops chronologically oldest sources rather than newer in-test recipes and preserves original reference numbers", async () => {
    const { memoryPayload } = await import("./provider");
    const recipes: EvidenceRecipe[] = Array.from({ length: 20 }, (_, index) => ({
      id: `source-${index + 1}`, title: `Recipe ${index + 1} ` + '"'.repeat(120),
      state: index < 10 ? "approved" : "in_test", updatedAt: new Date(Date.UTC(2026, 8, index + 1)),
      recipeIngredients: [],
      contentJson: { ingredients: [String.fromCharCode(65 + index) + "\\".repeat(300)], method: ['"'.repeat(320)] },
    }));
    const evidence = selectEvidence(recipes);
    expect(evidence).toHaveLength(20);
    // Approved-first selection places older recipes ahead of newer in-test ones.
    expect(evidence[0]!.id).toBe("source-10");
    const oldestRef = evidence.findIndex(source => source.id === "source-1") + 1;
    const newestRef = evidence.findIndex(source => source.id === "source-20") + 1;
    const serialized = memoryPayload(inputOf(evidence));
    const payload = JSON.parse(serialized) as Payload;
    const refs = payload.recipes.map(recipe => recipe.ref);
    expect(serialized.length).toBeLessThanOrEqual(20_000);
    expect(refs).not.toContain(oldestRef);
    expect(refs).toContain(newestRef);
    for (const recipe of payload.recipes) {
      expect(recipe.title).toBe(evidence[recipe.ref - 1]!.title.slice(0, 120));
    }
  });

  it("trims before the paid call and emits one well-formed provider request, not a size retry", async () => {
    vi.stubEnv("CULINARY_MEMORY_MODEL", "glm-4.7-flash");
    reserveGeneration.mockResolvedValue({ id: "reservation" });
    const fetcher = vi.fn().mockResolvedValue(Response.json({
      choices: [{ finish_reason: "stop", message: { content: '{"trends":[]}' } }],
      usage: { prompt_tokens: 30, completion_tokens: 10 },
    }));
    vi.stubGlobal("fetch", fetcher);
    const { generateMemory } = await import("./provider");
    const usage = vi.fn();
    const evidence = Array.from({ length: 35 }, (_, index) => evidenceOf(index + 1));
    await expect(generateMemory(inputOf(evidence), usage)).resolves.toEqual({ trends: [], rejected: 0 });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(reserveGeneration).toHaveBeenCalledOnce();
    expect(usage).toHaveBeenCalledOnce();
    const body = JSON.parse(fetcher.mock.calls[0]![1].body);
    const content: string = body.messages[1].content;
    expect(content.length).toBeLessThanOrEqual(20_000);
    expect((JSON.parse(content) as Payload).recipes.length).toBeLessThan(evidence.length);
  });
});
