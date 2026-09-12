import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./budget", () => ({ reserveGeneration: vi.fn().mockResolvedValue({ id: "reservation" }), settleGeneration: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../logger", () => ({ logger: { info: vi.fn() } }));
import { generateGlmJson } from "./glm";
import { logger } from "../logger";
import { reserveGeneration, settleGeneration } from "./budget";
beforeEach(() => {
  vi.stubEnv("ZAI_API_KEY", "glm-test");
  vi.mocked(reserveGeneration).mockReset().mockResolvedValue({ id: "reservation" } as never);
  vi.mocked(settleGeneration).mockClear();
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("GLM structured generation", () => {
  it.each(["extraction", "menuStyle", "menuTheme", "memory"] as const)("guards every %s generation before contacting GLM", async task => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    vi.mocked(reserveGeneration).mockRejectedValueOnce(new Error("ai_budget_exhausted"));
    await expect(generateGlmJson({ task, system: "JSON", content: "Data" })).rejects.toThrow("ai_budget_exhausted");
    expect(reserveGeneration).toHaveBeenCalledWith(expect.objectContaining({ task }), expect.any(Number));
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("settles final usage despite invalid JSON and uses full-context reserves for vision", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ choices: [{ finish_reason: "stop", message: { content: "invalid" } }], usage: { prompt_tokens: 100, completion_tokens: 200 } })));
    await expect(generateGlmJson({ task: "extraction", system: "JSON", content: [{ type: "image_url", image_url: { url: "data:image/png;base64,AA==" } }] })).rejects.toThrow("ai_response_invalid");
    expect(reserveGeneration).toHaveBeenCalledWith(expect.anything(), 2097152);
    expect(settleGeneration).toHaveBeenCalledWith({ id: "reservation" }, expect.objectContaining({ inputTokens: 100, outputTokens: 200 }));
  });
  it("does not treat missing usage as zero cost", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ choices: [{ finish_reason: "stop", message: { content: '{}' } }] })));
    await generateGlmJson({ task: "memory", system: "JSON", content: "Data" });
    expect(settleGeneration).toHaveBeenCalledWith({ id: "reservation" }, undefined);
  });
  it("uses GLM Flash JSON mode with low reasoning and records all billed output", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ choices: [{ finish_reason: "stop", message: { content: '{"title":"Arroz"}' } }],
      usage: { prompt_tokens: 100, completion_tokens: 80, completion_tokens_details: { reasoning_tokens: 50 }, prompt_tokens_details: { cached_tokens: 20 } } }));
    vi.stubGlobal("fetch", fetcher);
    const onUsage = vi.fn();
    expect(await generateGlmJson({ task: "extraction", system: "Extraer receta", content: "Datos", onUsage })).toEqual({ title: "Arroz" });
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://api.z.ai/api/paas/v4/chat/completions");
    expect(JSON.parse(init.body)).toMatchObject({ model: "glm-5.3-flash", max_tokens: 8192, reasoning_effort: "low", thinking: { type: "enabled", clear_thinking: true }, response_format: { type: "json_object" } });
    expect(onUsage).toHaveBeenCalledWith({ inputTokens: 100, outputTokens: 80, cachedTokens: 20, reasoningTokens: 50 });
  });
  it.each(["length", "sensitive", "tool_calls", "network_error"])("rejects %s and records cost before failing", async finish_reason => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ choices: [{ finish_reason }], usage: { completion_tokens: 100 } }));
    vi.stubGlobal("fetch", fetcher); const onUsage = vi.fn();
    await expect(generateGlmJson({ task: "menuTheme", system: "JSON", content: "Datos", onUsage })).rejects.toThrow("ai_response_incomplete");
    expect(fetcher).toHaveBeenCalledTimes(1); expect(onUsage).toHaveBeenCalledOnce();
  });
  it("rejects invalid JSON without a second paid request", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ choices: [{ finish_reason: "stop", message: { content: "```json {} ```" } }] }));
    vi.stubGlobal("fetch", fetcher);
    await expect(generateGlmJson({ task: "memory", system: "JSON", content: "Datos" })).rejects.toThrow("ai_response_invalid");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("does not call the provider without a key", async () => {
    vi.stubEnv("ZAI_API_KEY", ""); const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(generateGlmJson({ task: "memory", system: "JSON", content: "Datos" })).rejects.toThrow("ai_provider_unconfigured");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("diagnoses invalid formatting without logging recipe content or credentials", async () => {
    vi.mocked(logger.info).mockClear();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ choices: [{ finish_reason: "stop", message: {
      content: '```json\n{"title":"PRIVATE_RECIPE",\n```',
    } }] })));
    await expect(generateGlmJson({ task: "extraction", system: "JSON", content: "PRIVATE_INPUT" })).rejects.toThrow("ai_response_invalid");
    expect(logger.info).toHaveBeenCalledWith("ai_json_invalid", expect.objectContaining({ reason: "invalid_json", fenced: true }));
    const logs = JSON.stringify(vi.mocked(logger.info).mock.calls);
    expect(logs).not.toContain("PRIVATE_RECIPE");
    expect(logs).not.toContain("PRIVATE_INPUT");
    expect(logs).not.toContain("glm-test");
  });
  it.each([
    '```json\n{"title":"Receta","ingredients":["20 ml ponzu, recién hecho"],"notes":"Reposar\\nServir"}\n```',
    '{"title":"Receta","ingredients":["20 ml ponzu, recién hecho",],"notes":"Reposar\\nServir",}',
    '{"title":"Receta","ingredients":["20 ml ponzu, recién hecho"],"notes":"Reposar\nServir"}',
  ])("normalizes presentation errors locally without losing quantities or text", async content => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ choices: [{ finish_reason: "stop", message: { content } }] }));
    vi.stubGlobal("fetch", fetcher);
    expect(await generateGlmJson({ task: "extraction", system: "JSON", content: "Recipe" })).toEqual({
      title: "Receta", ingredients: ["20 ml ponzu, recién hecho"], notes: "Reposar\nServir",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([
    '{"title":"Receta","ingredients":["20 ml ponzu"',
    'Texto añadido: {"title":"Receta"}',
    '{"title":"Una"}{"title":"Otra"}',
    '{"ingredients":[,]}',
    '{"title":"Receta", "notes":"Dijo "hola""}',
  ])("does not invent missing content or discard ambiguous output", async content => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ choices: [{ finish_reason: "stop", message: { content } }] }));
    vi.stubGlobal("fetch", fetcher);
    await expect(generateGlmJson({ task: "extraction", system: "JSON", content: "Recipe" })).rejects.toThrow("ai_response_invalid");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
