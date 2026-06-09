import { describe, it, expect } from "vitest";
import { highlightQuantities } from "../highlight-quantities";

describe("highlightQuantities (C-05)", () => {
  it("retorna [] para input vacío", () => {
    expect(highlightQuantities("")).toEqual([]);
  });

  it("no resalta texto sin cantidades", () => {
    expect(highlightQuantities("Rectificar de sal según el punto del pescado.")).toEqual([
      { type: "text", text: "Rectificar de sal según el punto del pescado." },
    ]);
  });

  it("detecta gramos pegados al número", () => {
    const r = highlightQuantities("8g sal fina");
    expect(r).toEqual([
      { type: "qty", text: "8g" },
      { type: "text", text: " sal fina" },
    ]);
  });

  it("detecta gramos con espacio", () => {
    const r = highlightQuantities("8 g sal fina");
    expect(r).toEqual([
      { type: "qty", text: "8 g" },
      { type: "text", text: " sal fina" },
    ]);
  });

  it("detecta temperaturas en °C", () => {
    const r = highlightQuantities("Cocción a 70°C");
    expect(r).toEqual([
      { type: "text", text: "Cocción a " },
      { type: "qty", text: "70°C" },
    ]);
  });

  it("detecta múltiples cantidades en una frase", () => {
    const r = highlightQuantities("Pechuga 56°C, piernas 70°C / 11h 30m");
    const qtys = r.filter((t) => t.type === "qty").map((t) => t.text);
    expect(qtys).toEqual(["56°C", "70°C", "11h", "30m"]);
  });

  it("detecta ml y kg y l", () => {
    const r = highlightQuantities("560 ml agua, 1.5 kg pescado, 2 l caldo");
    const qtys = r.filter((t) => t.type === "qty").map((t) => t.text);
    expect(qtys).toEqual(["560 ml", "1.5 kg", "2 l"]);
  });

  it("detecta minutos abreviados", () => {
    const r = highlightQuantities("Reposar 30 min");
    expect(r.some((t) => t.type === "qty" && t.text === "30 min")).toBe(true);
  });

  it("acepta decimales con coma", () => {
    const r = highlightQuantities("1,5 kg manteca");
    expect(r[0]).toEqual({ type: "qty", text: "1,5 kg" });
  });
});
