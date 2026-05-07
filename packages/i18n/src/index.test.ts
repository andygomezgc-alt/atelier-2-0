import { describe, expect, it as test } from "vitest";
import { t, es, it as itDict, en } from "./index";

describe("t()", () => {
  test("returns Spanish by default", () => {
    expect(t("tab_inicio")).toBe("Inicio");
  });

  test("interpolates {name}", () => {
    expect(t("inicio_greet", "es", { name: "Andrea" })).toBe("Hola, Andrea —");
    expect(t("inicio_greet", "it", { name: "Andrea" })).toBe("Ciao, Andrea —");
    expect(t("inicio_greet", "en", { name: "Andrea" })).toBe("Hi, Andrea —");
  });

  test("falls back to ES when language dict is unknown", () => {
    // @ts-expect-error - testing a runtime fallback path
    expect(t("tab_inicio", "fr")).toBe("Inicio");
  });
});

describe("dictionary parity", () => {
  test("IT has the same keys as ES", () => {
    expect(Object.keys(itDict).sort()).toEqual(Object.keys(es).sort());
  });

  test("EN has the same keys as ES", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(es).sort());
  });
});
