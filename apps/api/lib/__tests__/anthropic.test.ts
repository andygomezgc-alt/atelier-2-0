import { describe, expect, it } from "vitest";
import { buildMessageBlocks, type Msg } from "../anthropic";

// El breakpoint de caché va SOLO en el último mensaje: así el turno siguiente
// lee todo el hilo anterior desde caché (~10% del precio) en vez de
// reprocesarlo entero. Poner uno por mensaje quemaría el tope de 4 por request.
describe("buildMessageBlocks", () => {
  const hilo: Msg[] = [
    { role: "user", content: "una crema de calabaza" },
    { role: "assistant", content: "probá con jengibre" },
    { role: "user", content: "y sin lácteos?" },
  ];

  it("marca el último mensaje con cache_control efímero", () => {
    const out = buildMessageBlocks(hilo);
    expect(out.at(-1)).toEqual({
      role: "user",
      content: [
        {
          type: "text",
          text: "y sin lácteos?",
          cache_control: { type: "ephemeral" },
        },
      ],
    });
  });

  it("deja los mensajes anteriores como string plano (sin breakpoint)", () => {
    const out = buildMessageBlocks(hilo);
    expect(out.slice(0, -1)).toEqual([
      { role: "user", content: "una crema de calabaza" },
      { role: "assistant", content: "probá con jengibre" },
    ]);
  });

  it("conserva el orden y los roles", () => {
    expect(buildMessageBlocks(hilo).map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "user",
    ]);
  });

  it("usa un solo breakpoint aunque el hilo sea largo", () => {
    const largo: Msg[] = Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `msg ${i}`,
    }));
    const conCache = buildMessageBlocks(largo).filter((m) => Array.isArray(m.content));
    expect(conCache).toHaveLength(1);
  });

  it("con un único mensaje, ese lleva el breakpoint", () => {
    const out = buildMessageBlocks([{ role: "user", content: "hola" }]);
    expect(out).toHaveLength(1);
    expect(Array.isArray(out[0]!.content)).toBe(true);
  });

  it("con hilo vacío devuelve vacío (no revienta con el índice -1)", () => {
    expect(buildMessageBlocks([])).toEqual([]);
  });
});
