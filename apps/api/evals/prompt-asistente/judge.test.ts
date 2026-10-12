import { afterEach, describe, expect, it, vi } from "vitest";
import { judgeEffort, judgeRequest, type JudgeInput } from "./judge";

const INPUT: JudgeInput = {
  context: { nombre: "Casa" }, messages: [{ role: "user", content: "¿Qué es un fumet?" }], answer: "Un caldo corto de pescado.",
  criteria: ["Va al grano.", "Es correcto."],
};

// Lo que se manda al juez, sin el system, los mensajes ni el cuerpo del esquema.
function visible(request: ReturnType<typeof judgeRequest>) {
  const { format, ...output } = request.output_config;
  return { model: request.model, max_tokens: request.max_tokens, thinking: request.thinking, output_config: { ...output, format: { type: format.type } } };
}

afterEach(() => vi.unstubAllEnvs());

describe("judgeRequest", () => {
  it("con EVAL_JUDGE_MODEL y EVAL_JUDGE_EFFORT manda el modelo, el esfuerzo y razonamiento adaptativo", () => {
    vi.stubEnv("EVAL_JUDGE_MODEL", "claude-opus-5-5");
    vi.stubEnv("EVAL_JUDGE_EFFORT", "max");
    const request = judgeRequest(INPUT);
    console.log("petición del juez:", JSON.stringify(visible(request)));
    expect(visible(request)).toEqual({
      model: "claude-opus-5-5", max_tokens: 64000, thinking: { type: "adaptive" },
      output_config: { effort: "max", format: { type: "json_schema" } },
    });
    expect(request).not.toHaveProperty("fallbacks");
  });

  it("sin EVAL_JUDGE_EFFORT no fija esfuerzo y el modelo por defecto es claude-sonnet-5-5", () => {
    vi.stubEnv("EVAL_JUDGE_MODEL", "");
    vi.stubEnv("EVAL_JUDGE_EFFORT", "");
    const request = judgeRequest(INPUT);
    expect(request.model).toBe("claude-sonnet-5-5");
    expect(request.output_config).not.toHaveProperty("effort");
    expect(request.output_config.format.schema).toMatchObject({ required: ["c1", "c2"], additionalProperties: false });
  });

  it("rechaza un esfuerzo desconocido", () => {
    vi.stubEnv("EVAL_JUDGE_EFFORT", "extreme");
    expect(() => judgeEffort()).toThrow(/EVAL_JUDGE_EFFORT/);
  });
});
