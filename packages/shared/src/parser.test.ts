import { describe, it, expect } from "vitest";
import { scaleIngredientLine } from "./parser";

describe("scaleIngredientLine", () => {
  it("escala cantidad+unidad pegada (Fase A)", () => {
    expect(scaleIngredientLine("200g harina", 2)).toBe("400g harina");
  });

  it("escala cantidad con unidad y 'de' (Fase B), preservando formato", () => {
    expect(scaleIngredientLine("200 g de harina", 2)).toBe("400 g de harina");
  });

  it("escala solo-cantidad (Fase C)", () => {
    expect(scaleIngredientLine("2 cebollas", 3)).toBe("6 cebollas");
  });

  it("escala decimales y acepta coma como separador", () => {
    expect(scaleIngredientLine("1.5 kg tomate", 2)).toBe("3 kg tomate");
    expect(scaleIngredientLine("1,5 kg pan", 2)).toBe("3 kg pan");
  });

  it("escala el formato del extractor (Fase D: nombre, qty unidad)", () => {
    expect(scaleIngredientLine("Manteca clarificada, 30 g", 2)).toBe(
      "Manteca clarificada, 60 g",
    );
  });

  it("achica con factor < 1", () => {
    expect(scaleIngredientLine("200g harina", 0.5)).toBe("100g harina");
  });

  it("NO toca líneas sin cantidad detectable", () => {
    expect(scaleIngredientLine("una pizca de sal", 5)).toBe("una pizca de sal");
    expect(scaleIngredientLine("harina 00", 2)).toBe("harina 00");
  });

  it("NO escala fracciones (no soportadas, quedan intactas)", () => {
    expect(scaleIngredientLine("1/2 cebolla", 2)).toBe("1/2 cebolla");
  });

  it("factor inválido devuelve la línea intacta", () => {
    expect(scaleIngredientLine("200g harina", 0)).toBe("200g harina");
    expect(scaleIngredientLine("200g harina", NaN)).toBe("200g harina");
  });

  it("redondea a 2 decimales", () => {
    expect(scaleIngredientLine("10g cacao", 1.333)).toBe("13.33g cacao");
  });
});
