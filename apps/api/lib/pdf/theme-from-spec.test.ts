import { describe, test, expect } from "vitest";
import { MenuStyleSpecSchema, type MenuStyleSpec } from "@atelier/shared";
import { themeFromSpec } from "./templates";

const VALID_SPEC: MenuStyleSpec = {
  fontCategory: "serif",
  bgColor: "#f4efe4",
  inkColor: "#2b2b2b",
  accentColor: "#8a2432",
  headingColor: "#1d3a2f",
  frame: "none",
  titleAlign: "center",
  titleItalic: true,
  titleSizePt: 28,
  dividerStyle: "accent-rule",
  sectionCase: "uppercase",
  dishLayout: "row",
};

describe("MenuStyleSpecSchema", () => {
  test("acepta un spec válido", () => {
    const r = MenuStyleSpecSchema.safeParse(VALID_SPEC);
    expect(r.success).toBe(true);
  });

  test("rechaza hex inválido", () => {
    expect(
      MenuStyleSpecSchema.safeParse({ ...VALID_SPEC, bgColor: "#zzz123" }).success,
    ).toBe(false);
    expect(
      MenuStyleSpecSchema.safeParse({ ...VALID_SPEC, accentColor: "red" }).success,
    ).toBe(false);
    // Hex de 3 dígitos tampoco (el theme builder espera 6).
    expect(
      MenuStyleSpecSchema.safeParse({ ...VALID_SPEC, inkColor: "#fff" }).success,
    ).toBe(false);
  });

  test("rechaza enum fuera de rango y titleSizePt fuera de [22,34]", () => {
    expect(
      MenuStyleSpecSchema.safeParse({ ...VALID_SPEC, dishLayout: "diagonal" }).success,
    ).toBe(false);
    expect(
      MenuStyleSpecSchema.safeParse({ ...VALID_SPEC, titleSizePt: 40 }).success,
    ).toBe(false);
    expect(
      MenuStyleSpecSchema.safeParse({ ...VALID_SPEC, titleSizePt: 21 }).success,
    ).toBe(false);
  });
});

describe("themeFromSpec", () => {
  test("el css lleva bg e ink del spec y el accent en precios", () => {
    const theme = themeFromSpec(VALID_SPEC);
    expect(theme.css).toContain("background: #f4efe4");
    expect(theme.css).toContain("color: #2b2b2b");
    expect(theme.css).toMatch(/\.dish-price\s*{[^}]*color:\s*#8a2432/);
    // Serif → stack de ELEGANT (system fonts, nada externo).
    expect(theme.css).toContain("'Iowan Old Style'");
  });

  test("frame double genera border double con el accent (y frame() envuelve)", () => {
    const theme = themeFromSpec({ ...VALID_SPEC, frame: "double" });
    expect(theme.css).toContain("border: 1.5pt double #8a2432");
    expect(theme.frame).toBeDefined();
    expect(theme.frame!("<p>x</p>")).toBe('<div class="frame"><p>x</p></div>');
  });

  test("frame none no genera frame()", () => {
    const theme = themeFromSpec({ ...VALID_SPEC, frame: "none" });
    expect(theme.frame).toBeUndefined();
    expect(theme.css).not.toContain(".frame");
  });

  test("guard de contraste: bg oscuro + tinta oscura fuerza tinta clara legible", () => {
    const theme = themeFromSpec({
      ...VALID_SPEC,
      bgColor: "#1b1b1b",
      inkColor: "#222222",
      headingColor: "#101010",
    });
    // La tinta y el heading emitidos por el modelo son ilegibles sobre ese
    // fondo → se fuerzan a la tinta clara de la casa.
    expect(theme.css).toContain("color: #f9f7f2; background: #1b1b1b");
    expect(theme.css).toMatch(/h1\s*{[^}]*color:\s*#f9f7f2/);
    expect(theme.css).not.toContain("#222222");
    expect(theme.css).not.toContain("#101010");
  });

  test("guard de contraste: bg claro + tinta clara fuerza tinta oscura", () => {
    const theme = themeFromSpec({
      ...VALID_SPEC,
      bgColor: "#ffffff",
      inkColor: "#f0f0f0",
    });
    expect(theme.css).toContain("color: #2a2520; background: #ffffff");
  });

  test("guard de contraste: combinación legible queda intacta", () => {
    const theme = themeFromSpec(VALID_SPEC);
    expect(theme.css).toContain("color: #2b2b2b; background: #f4efe4");
  });

  test("dishLayout grid genera grid; row genera flex; stack genera bloque punteado", () => {
    expect(themeFromSpec({ ...VALID_SPEC, dishLayout: "grid" }).css).toMatch(
      /\.dish\s*{[^}]*grid-template-columns/,
    );
    expect(themeFromSpec({ ...VALID_SPEC, dishLayout: "row" }).css).toMatch(
      /\.dish\s*{[^}]*display:\s*flex/,
    );
    expect(themeFromSpec({ ...VALID_SPEC, dishLayout: "stack" }).css).toMatch(
      /\.dish\s*{[^}]*dotted/,
    );
  });

  test("titleItalic/titleSizePt/titleAlign se reflejan en h1", () => {
    const theme = themeFromSpec({
      ...VALID_SPEC,
      titleItalic: false,
      titleSizePt: 24,
      titleAlign: "left",
    });
    expect(theme.css).toMatch(/h1\s*{[^}]*text-align:\s*left/);
    expect(theme.css).toMatch(/h1\s*{[^}]*font-size:\s*24pt/);
    expect(theme.css).not.toMatch(/h1\s*{[^}]*font-style:\s*italic/);
  });

  test("dividerStyle none no emite .rule en el header", () => {
    const theme = themeFromSpec({ ...VALID_SPEC, dividerStyle: "none" });
    expect(theme.header("R", "Carta", "")).not.toContain('class="rule"');
    const withRule = themeFromSpec(VALID_SPEC);
    expect(withRule.header("R", "Carta", "")).toContain('class="rule"');
  });
});
