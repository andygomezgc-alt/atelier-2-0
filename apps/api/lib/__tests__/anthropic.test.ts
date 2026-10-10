import { describe, expect, it } from "vitest";
import { buildMessageBlocks, buildSystemBlocks, type Msg } from "../anthropic";

describe("buildSystemBlocks — notas del chef", () => {
  it("incluye las notas en orden dentro del bloque de identidad cacheado", () => {
    const blocks = buildSystemBlocks(
      {
        name: "Casa",
        identityLine: "Cocina vegetal",
        chefNotes: ["No usamos cerdo", "El caldo no lleva apio"],
      },
      [],
      null,
    );

    expect(blocks[1]).toEqual({
      type: "text",
      text:
        "# Restaurante: Casa\n" +
        "Identidad: Cocina vegetal\n" +
        "Notas del chef (datos fijos del restaurante):\n" +
        "- No usamos cerdo\n" +
        "- El caldo no lleva apio\n",
      cache_control: { type: "ephemeral" },
    });
  });

  it("mantiene el texto de identidad idéntico sin notas", () => {
    const expected = "# Restaurante: Casa\nIdentidad: Cocina vegetal\n";

    expect(
      buildSystemBlocks(
        { name: "Casa", identityLine: "Cocina vegetal" },
        [],
        null,
      )[1]!.text,
    ).toBe(expected);
    expect(
      buildSystemBlocks(
        { name: "Casa", identityLine: "Cocina vegetal", chefNotes: [] },
        [],
        null,
      )[1]!.text,
    ).toBe(expected);
  });
});

it("la memoria convive con las recetas recientes y mantiene la idea actual", () => {
  const restaurant = { name: "Casa", identityLine: "Cocina vegetal" };
  const recent = [{ title: "Receta anterior" }];
  const text = JSON.stringify(buildSystemBlocks(restaurant, recent, "Idea actual", "Preferimos asar"));
  expect(text).toContain("Preferimos asar"); expect(text).toContain("Idea actual"); expect(text).toContain("Cocina vegetal");
  expect(text).toContain("- Receta anterior");
  expect(text).not.toContain("- Receta anterior (");
  expect(JSON.stringify(buildSystemBlocks(restaurant, recent, null))).toContain("Receta anterior");
});

it("usa recetas recientes si la memoria está vacía o no se pudo preparar", () => {
  const restaurant = { name: "Casa", identityLine: null };
  const recent = [{ title: "Receta reciente" }];
  expect(JSON.stringify(buildSystemBlocks(restaurant, recent, null, ""))).toContain("Receta reciente");
  expect(JSON.stringify(buildSystemBlocks(restaurant, recent, null, null))).toContain("Receta reciente");
});

it("cachea la memoria y deja recetas e idea en el bloque dinámico sin superar cuatro breakpoints", () => {
  const blocks = buildSystemBlocks(
    { name: "Casa", identityLine: "Vegetal" },
    [{ title: "Receta reciente" }],
    "Idea actual",
    "Técnicas de brasa",
  );
  expect(blocks.map(block => block.text)).toEqual(expect.arrayContaining([
    expect.stringContaining("Restaurante: Casa"), "Técnicas de brasa", expect.stringContaining("Idea actual"),
  ]));
  expect(blocks[2]).toEqual({ type: "text", text: "Técnicas de brasa", cache_control: { type: "ephemeral" } });
  expect(blocks[3]!.text).toContain("# Recetas recientes del cuaderno");
  expect(blocks[3]!.text).toContain("Receta reciente");
  expect(blocks[3]!.text).toContain("Idea actual");
  expect("cache_control" in blocks[3]!).toBe(false);
  const systemBreakpoints = blocks.filter(block => "cache_control" in block);
  expect(systemBreakpoints).toHaveLength(3);
  const thread = buildMessageBlocks([{ role: "user", content: "Otra idea" }]);
  const totalBreakpoints = JSON.stringify({ blocks, thread }).match(/"cache_control"/g) ?? [];
  expect(totalBreakpoints).toHaveLength(4);
});

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

describe("buildSystemBlocks — ciudad, nombre y mes", () => {
  const sinCiudad = "# Restaurante: Casa\nIdentidad: Cocina vegetal\n";

  it("añade la ciudad recortada justo después del nombre del restaurante", () => {
    expect(
      buildSystemBlocks({ name: "Casa", identityLine: "Cocina vegetal", city: "  Valencia " }, [], null)[1]!.text,
    ).toBe("# Restaurante: Casa\nUbicación: Valencia\nIdentidad: Cocina vegetal\n");
  });

  it("no añade línea de ubicación si la ciudad es nula, vacía o solo espacios", () => {
    expect(buildSystemBlocks({ name: "Casa", identityLine: "Cocina vegetal", city: null }, [], null)[1]!.text).toBe(sinCiudad);
    expect(buildSystemBlocks({ name: "Casa", identityLine: "Cocina vegetal", city: "   " }, [], null)[1]!.text).toBe(sinCiudad);
  });

  it("el bloque de conversación lleva quien escribe y el mes UTC, sin marcador de caché", () => {
    const blocks = buildSystemBlocks(
      { name: "Casa", identityLine: null },
      [],
      null,
      null,
      { speakerName: "Andy", now: new Date("2026-10-10T12:00:00Z") },
    );
    const dynamic = blocks.at(-1)!;
    expect(dynamic.text).toBe("# Conversación\n- Quien escribe: Andy\n- Mes actual: octubre de 2026");
    expect("cache_control" in dynamic).toBe(false);
  });

  it("usa el mes UTC aunque la hora local ya esté en el mes siguiente", () => {
    const blocks = buildSystemBlocks(
      { name: "Casa", identityLine: null },
      [],
      null,
      null,
      { speakerName: "Andy", now: new Date("2026-01-01T00:30:00Z") },
    );
    expect(blocks.at(-1)!.text).toContain("- Mes actual: enero de 2026");
  });

  it("separa el bloque de conversación con una línea en blanco cuando hay recetas o idea", () => {
    const blocks = buildSystemBlocks(
      { name: "Casa", identityLine: null },
      [{ title: "Receta reciente" }],
      "Idea actual",
      null,
      { speakerName: "Andy", now: new Date("2026-10-10T12:00:00Z") },
    );
    expect(blocks.at(-1)!.text).toBe(
      "# Recetas recientes del cuaderno\n- Receta reciente\n\n# Idea anclada\nIdea actual\n\n" +
        "# Conversación\n- Quien escribe: Andy\n- Mes actual: octubre de 2026",
    );
  });

  it("sin nombre no escribe la línea «Quien escribe»", () => {
    const text = buildSystemBlocks(
      { name: "Casa", identityLine: null },
      [],
      null,
      null,
      { speakerName: null, now: new Date("2026-10-10T12:00:00Z") },
    ).at(-1)!.text;
    expect(text).toBe("# Conversación\n- Mes actual: octubre de 2026");
  });

  it("mantiene tres marcadores de caché en el sistema aunque cambie el bloque dinámico", () => {
    const blocks = buildSystemBlocks(
      { name: "Casa", identityLine: "Vegetal", city: "Valencia" },
      [{ title: "Receta reciente" }],
      "Idea actual",
      "Técnicas de brasa",
      { speakerName: "Andy", now: new Date("2026-10-10T12:00:00Z") },
    );
    expect(blocks.filter((block) => "cache_control" in block)).toHaveLength(3);
  });
});
