import { describe, it, expect } from "vitest";
import { formatQuantity, parseIngredient, parseQuantity, scaleIngredientLine } from "./parser";

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

  // Changed on purpose (F1): fractions are now a supported quantity token, so
  // "1/2 cebolla" x2 scales to one onion instead of staying untouched.
  it("scales fractions as decimals", () => {
    expect(scaleIngredientLine("1/2 cebolla", 2)).toBe("1 cebolla");
    expect(scaleIngredientLine("½ limón", 3)).toBe("1,5 limón");
    expect(scaleIngredientLine("1 1/2 kg patata", 2)).toBe("3 kg patata");
  });

  it("factor inválido devuelve la línea intacta", () => {
    expect(scaleIngredientLine("200g harina", 0)).toBe("200g harina");
    expect(scaleIngredientLine("200g harina", NaN)).toBe("200g harina");
  });

  // Changed on purpose (F1): scaled quantities are written with a decimal
  // comma and up to 3 decimals, like the standard ingredient line and the
  // Decimal(10,3) qty column, so the scaled text parses to the scaled qty.
  it("redondea a 3 decimales con coma decimal", () => {
    expect(scaleIngredientLine("10g cacao", 1.333)).toBe("13,33g cacao");
    expect(scaleIngredientLine("0,125 kg sal", 3)).toBe("0,375 kg sal");
    expect(scaleIngredientLine("1 kg sal", 1 / 3)).toBe("0,333 kg sal");
  });

  it("writes decimals with a comma", () => {
    expect(scaleIngredientLine("1,5 kg pan", 3)).toBe("4,5 kg pan");
    expect(scaleIngredientLine("Caldo de pescado, 1,2 l", 2)).toBe("Caldo de pescado, 2,4 l");
  });

  it("scales the literal token and keeps cl/dl as written", () => {
    expect(scaleIngredientLine("20 cl ron", 2)).toBe("40 cl ron");
    expect(scaleIngredientLine("1 dl nata", 3)).toBe("3 dl nata");
  });

  it("still scales household measures", () => {
    expect(scaleIngredientLine("1 cucharada de aceite", 2)).toBe("2 cucharada de aceite");
  });

  it("scales both ends of a range", () => {
    expect(scaleIngredientLine("2-3 dientes de ajo", 2)).toBe("4-6 dientes de ajo");
    expect(scaleIngredientLine("15–18 g sal", 2)).toBe("30–36 g sal");
  });

  it("leaves leading numbers that are not quantities untouched", () => {
    expect(scaleIngredientLine("00 harina", 2)).toBe("00 harina");
    expect(scaleIngredientLine("35 % nata", 2)).toBe("35 % nata");
  });
});

describe("parseIngredient", () => {
  it("keeps the existing quantity-first and name-first forms", () => {
    expect(parseIngredient("200g de harina")).toEqual({ quantity: 200, unit: "g", name: "harina", raw: "200g de harina" });
    expect(parseIngredient("2 cebollas medianas")).toMatchObject({ quantity: 2, unit: "unidad", name: "cebollas medianas" });
    expect(parseIngredient("harina 00")).toMatchObject({ quantity: null, unit: null, name: "harina 00" });
    expect(parseIngredient("una pizca de sal")).toMatchObject({ quantity: null, unit: null, name: "una pizca de sal" });
    expect(parseIngredient("Manteca clarificada, 30 g")).toMatchObject({ quantity: 30, unit: "g", name: "Manteca clarificada" });
    expect(parseIngredient("Salsa casera, mediterránea, 200 g")).toMatchObject({
      quantity: 200, unit: "g", name: "Salsa casera, mediterránea",
    });
  });

  it("reads a decimal comma in the name-first form", () => {
    expect(parseIngredient("Caldo de pescado, 1,2 l")).toMatchObject({ quantity: 1.2, unit: "l", name: "Caldo de pescado" });
  });

  it("converts cl and dl to ml", () => {
    expect(parseIngredient("20 cl ron")).toMatchObject({ quantity: 200, unit: "ml", name: "ron" });
    expect(parseIngredient("20cl ron")).toMatchObject({ quantity: 200, unit: "ml", name: "ron" });
    expect(parseIngredient("3 dl de nata")).toMatchObject({ quantity: 300, unit: "ml", name: "nata" });
    expect(parseIngredient("0,3 dl leche")).toMatchObject({ quantity: 30, unit: "ml", name: "leche" });
    expect(parseIngredient("Ron añejo, 5 cl")).toMatchObject({ quantity: 50, unit: "ml", name: "Ron añejo" });
  });

  it("does not turn household measures into units", () => {
    expect(parseIngredient("1 cucharada de aceite")).toEqual({
      quantity: null, unit: null, name: "aceite", measure: "1 cucharada", raw: "1 cucharada de aceite",
    });
    expect(parseIngredient("1 cucharada aceite")).toMatchObject({ quantity: null, unit: null, name: "aceite", measure: "1 cucharada" });
    expect(parseIngredient("2 cda aceite de oliva")).toMatchObject({ name: "aceite de oliva", measure: "2 cda" });
    expect(parseIngredient("½ cucharadita di sale")).toMatchObject({ quantity: null, name: "sale", measure: "½ cucharadita" });
    expect(parseIngredient("1 c/s sal")).toMatchObject({ quantity: null, name: "sal", measure: "1 c/s" });
    expect(parseIngredient("2 tazas de harina")).toMatchObject({ quantity: null, name: "harina", measure: "2 tazas" });
    expect(parseIngredient("1 tbsp of olive oil")).toMatchObject({ quantity: null, name: "olive oil", measure: "1 tbsp" });
    expect(parseIngredient("1 cucchiaio di olio")).toMatchObject({ quantity: null, name: "olio", measure: "1 cucchiaio" });
    expect(parseIngredient("1 pizzico sale")).toMatchObject({ quantity: null, name: "sale", measure: "1 pizzico" });
  });

  it("leaves measure undefined on ordinary lines", () => {
    expect(parseIngredient("200 g harina").measure).toBeUndefined();
    expect(parseIngredient("2 cebollas").measure).toBeUndefined();
  });

  it("reads fractions and decimal commas as the quantity", () => {
    expect(parseIngredient("½ limón")).toMatchObject({ quantity: 0.5, unit: "unidad", name: "limón" });
    expect(parseIngredient("1/2 cebolla")).toMatchObject({ quantity: 0.5, unit: "unidad", name: "cebolla" });
    expect(parseIngredient("1 1/2 kg patata")).toMatchObject({ quantity: 1.5, unit: "kg", name: "patata" });
    expect(parseIngredient("1½ kg patata")).toMatchObject({ quantity: 1.5, unit: "kg", name: "patata" });
    expect(parseIngredient("¾ l leche")).toMatchObject({ quantity: 0.75, unit: "l", name: "leche" });
    expect(parseIngredient("¼ de cebolla")).toMatchObject({ quantity: 0.25, unit: "unidad", name: "cebolla" });
    expect(parseIngredient("0,5 l leche")).toMatchObject({ quantity: 0.5, unit: "l", name: "leche" });
  });

  it("leaves ranges unparsed", () => {
    expect(parseIngredient("2-3 dientes de ajo")).toMatchObject({ quantity: null, unit: null, name: "2-3 dientes de ajo" });
  });

  it("reads ud as pieces", () => {
    expect(parseIngredient("4 ud calamar")).toMatchObject({ quantity: 4, unit: "unidad", name: "calamar" });
  });
});

describe("parseQuantity / formatQuantity", () => {
  it("parses every supported quantity token", () => {
    expect(parseQuantity("3")).toBe(3);
    expect(parseQuantity("1,5")).toBe(1.5);
    expect(parseQuantity("1.25")).toBe(1.25);
    expect(parseQuantity("1/2")).toBe(0.5);
    expect(parseQuantity("1 1/2")).toBe(1.5);
    expect(parseQuantity("½")).toBe(0.5);
    expect(parseQuantity("1½")).toBe(1.5);
    expect(parseQuantity("1 ¼")).toBe(1.25);
    expect(parseQuantity("1/0")).toBeNull();
    expect(parseQuantity("abc")).toBeNull();
    expect(parseQuantity("2-3")).toBeNull();
  });

  it("formats with a decimal comma and no trailing zeros", () => {
    expect(formatQuantity(400)).toBe("400");
    expect(formatQuantity(1.5)).toBe("1,5");
    expect(formatQuantity(1.3333)).toBe("1,333");
    expect(formatQuantity(1.3333, 2)).toBe("1,33");
    expect(formatQuantity(2.1)).toBe("2,1");
    expect(formatQuantity(0.30000000000000004)).toBe("0,3");
  });
});
