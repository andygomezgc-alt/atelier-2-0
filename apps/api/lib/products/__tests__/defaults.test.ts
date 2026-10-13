import { describe, expect, it } from "vitest";
import { categorizeFromName, defaultMermaPct, suggestedMermaPct } from "../defaults";

describe("suggestedMermaPct — an already-cleaned product starts at 0 % waste", () => {
  it.each([
    ["gamba pelada", "pescado"],
    ["rape limpio", "pescado"],
    ["lomos de merluza", "pescado"],
    ["merluza en filetes", "pescado"],
    ["salmón sin piel", "pescado"],
    ["muslo deshuesado", "carne"],
    ["gamberi sgusciati", "pescado"],
    ["filetto di orata", "pescado"],
    ["peeled shrimp", "pescado"],
    ["cebolla pelada", "verdura"],
  ] as const)("%s → 0", (name, category) => {
    expect(suggestedMermaPct(name, category)).toBe(0);
  });

  it.each([
    ["gamba roja", "pescado"],
    ["calamar", "pescado"],
    ["tentáculos de calamar", "pescado"],
    ["cebolla", "verdura"],
    ["pollo entero", "carne"],
  ] as const)("%s keeps the category default", (name, category) => {
    expect(suggestedMermaPct(name, category)).toBe(defaultMermaPct(category));
  });
});

describe("categorizeFromName — more fish", () => {
  it.each(["rape limpio", "coda di rospo", "monkfish", "corvina", "sepia", "seppia", "chipirón", "cigala", "besugo"])(
    "%s → pescado",
    (name) => {
      expect(categorizeFromName(name)).toBe("pescado");
    },
  );
});
