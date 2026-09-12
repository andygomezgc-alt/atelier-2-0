import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../ai/budget", () => ({ reserveGeneration: vi.fn().mockResolvedValue({ id: "reservation" }), settleGeneration: vi.fn().mockResolvedValue(undefined) }));
import { generateMemory } from "./provider";
const input = { evidence: [], identity: null, corrections: [], excluded: [], language: "es" };
beforeEach(() => { vi.stubEnv("ZAI_API_KEY", "test-key"); vi.stubEnv("CULINARY_MEMORY_MODEL", "glm-4.7-flash"); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("memory provider", () => {
  it("registra uso, desactiva razonamiento y limita la salida", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ choices: [{ finish_reason: "stop", message: { content: '{"trends":[]}' } }], usage: { prompt_tokens: 40, completion_tokens: 10 } }));
    vi.stubGlobal("fetch", fetcher); const usage = vi.fn();
    expect(await generateMemory(input, usage)).toEqual({ trends: [] });
    expect(usage).toHaveBeenCalledWith({ inputTokens: 40, outputTokens: 10, reasoningTokens: 0 });
    expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toMatchObject({ max_tokens: 4096, thinking: { type: "disabled" }, response_format: { type: "json_object" } });
  });
  it("respuesta truncada se rechaza y se contabiliza, sin reintento", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ choices: [{ finish_reason: "length" }], usage: { completion_tokens: 1200 } }));
    vi.stubGlobal("fetch", fetcher); const usage = vi.fn();
    await expect(generateMemory(input, usage)).rejects.toThrow("memory_response_incomplete");
    expect(fetcher).toHaveBeenCalledTimes(1); expect(usage).toHaveBeenCalledOnce();
  });
  it("sin configuración no llama a la red", async () => {
    vi.stubEnv("ZAI_API_KEY", ""); const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(generateMemory(input, vi.fn())).rejects.toThrow("unconfigured"); expect(fetcher).not.toHaveBeenCalled();
  });
});
