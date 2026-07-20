import { describe, test, expect } from "vitest";
import { FONT_IDS } from "@atelier/shared";
import { FONT_REGISTRY, fontFaceCss } from "./fonts";

describe("FONT_REGISTRY", () => {
  test("las claves coinciden EXACTAMENTE con FONT_IDS de @atelier/shared", () => {
    // El Zod del theme valida contra FONT_IDS (shared); el registro real vive en
    // apps/api. Si divergen, el modelo podría emitir un id válido para el Zod pero
    // sin fuente que embeber. Este test es el candado.
    expect([...Object.keys(FONT_REGISTRY)].sort()).toEqual([...FONT_IDS].sort());
  });

  test("cada familia declara al menos 400-normal", () => {
    for (const id of FONT_IDS) {
      const has400 = FONT_REGISTRY[id].files.some(
        (f) => f.weight === 400 && f.style === "normal",
      );
      expect(has400, `${id} debe tener 400-normal`).toBe(true);
    }
  });
});

describe("fontFaceCss", () => {
  test("emite @font-face con woff2 base64 inline de las familias pedidas", () => {
    const css = fontFaceCss(["playfair-display"]);
    expect(css).toContain("@font-face");
    expect(css).toContain("font-family:'Playfair Display'");
    expect(css).toContain("src:url(data:font/woff2;base64,");
  });

  test("dedup e ignora null/undefined", () => {
    const css = fontFaceCss(["lato", "lato", null, undefined]);
    const familyDecls = css.match(/font-family:'Lato'/g) ?? [];
    // Lato trae 3 archivos (400/700/italic) → 3 @font-face, no 6.
    expect(familyDecls.length).toBe(3);
  });

  test("string vacío si no se pide nada", () => {
    expect(fontFaceCss([])).toBe("");
    expect(fontFaceCss([null, undefined])).toBe("");
  });
});
