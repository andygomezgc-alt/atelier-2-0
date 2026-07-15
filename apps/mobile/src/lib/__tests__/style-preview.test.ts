import { describe, it, expect } from "vitest";
import { titlePxFromPt, legibleOn } from "../style-preview";

describe("titlePxFromPt", () => {
  it("mapea el extremo bajo del rango (22pt)", () => {
    expect(titlePxFromPt(22)).toBe(18);
  });

  it("mapea el extremo alto del rango (34pt)", () => {
    expect(titlePxFromPt(34)).toBe(27);
  });
});

describe("legibleOn", () => {
  it("deja pasar un color con contraste suficiente", () => {
    // Papel claro + tinta oscura de los themes fijos — contraste de sobra.
    expect(legibleOn("#f9f7f2", "#2a2520")).toBe("#2a2520");
  });

  it("cae al fallback oscuro sobre fondo claro cuando el color es ilegible", () => {
    // Mismo tono bg/ink (contraste ~1) sobre fondo claro (luminancia > 0.5).
    expect(legibleOn("#f4efe4", "#f4efe4")).toBe("#2a2520");
  });

  it("cae al fallback claro sobre fondo oscuro cuando el color es ilegible", () => {
    // Mismo tono bg/ink sobre fondo oscuro (luminancia <= 0.5).
    expect(legibleOn("#1a1512", "#1a1512")).toBe("#f9f7f2");
  });
});
