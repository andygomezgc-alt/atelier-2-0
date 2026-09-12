import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
vi.mock("../ai/budget", () => ({ reserveGeneration: vi.fn().mockResolvedValue({ id: "reservation" }), settleGeneration: vi.fn().mockResolvedValue(undefined) }));

const create = vi.fn();
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });


import { extractMenuStyle } from "./style-extract";

const SPEC = {
  fontCategory: "serif",
  bgColor: "#f4efe4",
  inkColor: "#2b2b2b",
  accentColor: "#8a2432",
  headingColor: "#1d3a2f",
  frame: "single",
  titleAlign: "center",
  titleItalic: true,
  titleSizePt: 28,
  dividerStyle: "accent-rule",
  sectionCase: "uppercase",
  dishLayout: "row",
};

function jsonReply(input: unknown, usage = {}, finish_reason = "stop") {
  return { choices: [{ finish_reason, message: { content: JSON.stringify(input) } }], usage };
}

beforeEach(() => {
  create.mockReset();
  vi.stubEnv("ZAI_API_KEY", "glm-test-key");
  vi.stubGlobal("fetch", vi.fn(async (_url, init) => Response.json(await create(JSON.parse(init.body)))));
});

describe("extractMenuStyle — imagen y páginas de PDF", () => {
  it("registra tokens aunque el modelo entregue un análisis truncado", async () => {
    create.mockResolvedValue(jsonReply(SPEC, { prompt_tokens: 95, completion_tokens: 2048 }, "length"));
    const onUsage = vi.fn();
    await expect(extractMenuStyle(new Uint8Array([1]), "image/jpeg", { onUsage })).rejects.toThrow("incompleto");
    expect(onUsage).toHaveBeenCalledWith(95, 2048);
  });

  it("un fallo de métricas no descarta el estilo válido", async () => {
    create.mockResolvedValue(jsonReply(SPEC, { prompt_tokens: 95, completion_tokens: 180 }));
    const onUsage = vi.fn().mockRejectedValue(new Error("metrics unavailable"));
    await expect(extractMenuStyle(new Uint8Array([1]), "image/jpeg", { onUsage })).resolves.toEqual(SPEC);
  });

  it("imagen → GLM recibe un data URL con el MIME correcto", async () => {
    create.mockResolvedValue(jsonReply(SPEC));
    const buffer = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    const spec = await extractMenuStyle(buffer, "image/png");
    expect(spec).toEqual(SPEC);

    const call = create.mock.calls[0]![0];
    const content = call.messages[1].content;
    const fileBlock = content[0];
    expect(fileBlock.type).toBe("image_url");
    expect(fileBlock.image_url.url).toMatch(/^data:image\/png;base64,/);

    const text = call.messages[0].content;
    // Sin PDF de por medio, no debe aparecer la nota de multi-página.
    expect(text).not.toMatch(/varias páginas/i);
  });

  it("PDF → GLM recibe páginas renderizadas y la nota multi-página", async () => {
    create.mockResolvedValue(jsonReply(SPEC));
    const buffer = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const spec = await extractMenuStyle(buffer, "application/pdf");
    expect(spec).toEqual(SPEC);

    const call = create.mock.calls[0]![0];
    const content = call.messages[1].content;
    const fileBlock = content[0];
    expect(fileBlock.type).toBe("image_url");
    expect(fileBlock.image_url.url).toMatch(/^data:image\/png;base64,/);

    const text = call.messages[0].content;
    expect(text).toMatch(/varias páginas/i);
  });

  it("JSON con spec inválido → lanza (Zod lo rechaza)", async () => {
    create.mockResolvedValue(jsonReply({ ...SPEC, fontCategory: "cursive" }));
    const buffer = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    await expect(extractMenuStyle(buffer, "image/jpeg")).rejects.toThrow();
  });
});

vi.mock("../ai/media", () => ({ visionParts: vi.fn(async (buffer: Uint8Array, mime: string) => [
  { type: "image_url", image_url: { url: `data:${mime === "application/pdf" ? "image/png" : mime};base64,${Buffer.from(buffer).toString("base64")}` } },
]) }));
