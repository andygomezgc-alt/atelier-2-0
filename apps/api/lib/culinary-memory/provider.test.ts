import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../ai/budget", () => ({ reserveGeneration: vi.fn().mockResolvedValue({ id: "reservation" }), settleGeneration: vi.fn().mockResolvedValue(undefined) }));
import { GeneratedTrendSchema, generateMemory } from "./provider";
const input = { evidence: [], identity: null, corrections: [], excluded: [], language: "es" };
beforeEach(() => { vi.stubEnv("ZAI_API_KEY", "test-key"); vi.stubEnv("CULINARY_MEMORY_MODEL", "glm-4.7-flash"); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("memory provider", () => {
  it("registra uso, desactiva razonamiento y limita la salida", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ choices: [{ finish_reason: "stop", message: { content: '{"trends":[]}' } }], usage: { prompt_tokens: 40, completion_tokens: 10 } }));
    vi.stubGlobal("fetch", fetcher); const usage = vi.fn();
    expect(await generateMemory(input, usage)).toEqual({ trends: [], rejected: 0 });
    expect(usage).toHaveBeenCalledWith({ inputTokens: 40, outputTokens: 10, reasoningTokens: 0 });
    expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toMatchObject({ max_tokens: 8192, thinking: { type: "disabled" }, response_format: { type: "json_object" } });
  });
  it("respuesta truncada se rechaza y se contabiliza, sin reintento", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ choices: [{ finish_reason: "length" }], usage: { completion_tokens: 1200 } }));
    vi.stubGlobal("fetch", fetcher); const usage = vi.fn();
    await expect(generateMemory(input, usage)).rejects.toThrow("memory_response_incomplete");
    expect(fetcher).toHaveBeenCalledTimes(1); expect(usage).toHaveBeenCalledOnce();
  });
  it("usa la configuración real de memoria con razonamiento y 8192 tokens", async () => {
    vi.stubEnv("CULINARY_MEMORY_MODEL", ""); vi.stubEnv("AI_GLM_MODEL", "");
    const fetcher = vi.fn().mockResolvedValue(Response.json({ choices: [{ finish_reason: "stop", message: { content: '{"trends":[]}' } }], usage: { prompt_tokens: 40, completion_tokens: 10 } }));
    vi.stubGlobal("fetch", fetcher);
    await generateMemory(input, vi.fn());
    const body = JSON.parse(fetcher.mock.calls[0]![1].body);
    expect(body).toMatchObject({ model: "glm-5.3-flash", max_tokens: 8192, reasoning_effort: "low" });
    expect(body.thinking).toEqual({ type: "enabled", clear_thinking: true });
  });
  it("respuesta truncada con la configuración real se rechaza como salida inválida", async () => {
    vi.stubEnv("CULINARY_MEMORY_MODEL", ""); vi.stubEnv("AI_GLM_MODEL", "");
    const fetcher = vi.fn().mockResolvedValue(Response.json({ choices: [{ finish_reason: "length" }], usage: { completion_tokens: 1200 } }));
    vi.stubGlobal("fetch", fetcher); const usage = vi.fn();
    await expect(generateMemory(input, usage)).rejects.toThrow("memory_response_incomplete");
    expect(JSON.parse(fetcher.mock.calls[0]![1].body).model).toBe("glm-5.3-flash");
    expect(fetcher).toHaveBeenCalledTimes(1); expect(usage).toHaveBeenCalledOnce();
  });
  it("pide al menos dos recetas distintas por tendencia en el prompt y en el esquema", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ choices: [{ finish_reason: "stop", message: { content: '{"trends":[]}' } }], usage: { prompt_tokens: 40, completion_tokens: 10 } }));
    vi.stubGlobal("fetch", fetcher);
    await generateMemory(input, vi.fn());
    const system: string = JSON.parse(fetcher.mock.calls[0]![1].body).messages[0].content;
    expect(system).toContain("al menos 2 recetas DIFERENTES");
    expect(system).not.toMatch(/al menos 3|tres recetas|tres fuentes/);
    const trend = (sources: number[]) => ({ key: "techniques", text: "Tendencia", sources });
    expect(GeneratedTrendSchema.safeParse(trend([1, 2])).success).toBe(true);
    expect(GeneratedTrendSchema.safeParse(trend([1])).success).toBe(false);
  });
  const respond = (content: unknown) => vi.fn().mockResolvedValue(Response.json({
    choices: [{ finish_reason: "stop", message: { content: JSON.stringify(content) } }], usage: { prompt_tokens: 40, completion_tokens: 10 },
  }));
  const good = { key: "techniques", text: "Buena", sources: [1, 2] };
  it("descarta solo las tendencias mal formadas y cuenta las rechazadas", async () => {
    vi.stubGlobal("fetch", respond({ trends: [
      good,
      { key: "cuisine", text: "Cita una sola receta", sources: [1] },
      { key: "inventada", text: "Categoría desconocida", sources: [1, 2] },
      { key: "flavours", text: "x".repeat(161), sources: [1, 2] },
      { key: "textures", text: "Demasiadas fuentes", sources: Array.from({ length: 21 }, (_, i) => i + 1) },
    ] }));
    expect(await generateMemory(input, vi.fn())).toEqual({ trends: [good], rejected: 4 });
  });
  it("deja pasar referencias fuera de rango al worker y conserva todas las tendencias válidas", async () => {
    const keys = ["cuisine", "ingredients", "techniques", "flavours", "textures"];
    vi.stubGlobal("fetch", respond({ trends: keys.map(key => ({ key, text: "Tendencia", sources: [1, 2, 99] })) }));
    const result = await generateMemory(input, vi.fn());
    expect(result.trends.map(t => t.key)).toEqual(keys);
    expect(result.trends[0]!.sources).toEqual([1, 2, 99]);
    expect(result.rejected).toBe(0);
  });
  it.each([["una lista", []], ["sin trends", {}], ["trends que no es una lista", { trends: {} }], ["null", null]])(
    "una respuesta que es %s sigue siendo inválida", async (_label, content) => {
      vi.stubGlobal("fetch", respond(content));
      await expect(generateMemory(input, vi.fn())).rejects.toMatchObject({ name: "ZodError" });
    });
  it("sin configuración no llama a la red", async () => {
    vi.stubEnv("ZAI_API_KEY", ""); const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(generateMemory(input, vi.fn())).rejects.toThrow("unconfigured"); expect(fetcher).not.toHaveBeenCalled();
  });
});
