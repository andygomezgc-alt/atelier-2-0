import { describe, expect, it } from "vitest";
import {
  detectPezzaturaFromName,
  formatPezzatura,
  parsePezzatura,
  resolvePezzaturaMode,
  type PezzaturaValue,
} from "./pezzatura";

// ─────────── resolvePezzaturaMode ───────────

describe("resolvePezzaturaMode", () => {
  it("pescado + marisco keyword → pz_per_kg", () => {
    expect(resolvePezzaturaMode("Gamberi Rossi di Mazara", "pescado")).toBe("pz_per_kg");
    expect(resolvePezzaturaMode("Scampi del Mediterraneo", "pescado")).toBe("pz_per_kg");
    expect(resolvePezzaturaMode("Vongole veraci", "pescado")).toBe("pz_per_kg");
    expect(resolvePezzaturaMode("Calamari", "pescado")).toBe("pz_per_kg");
    expect(resolvePezzaturaMode("Polpo di scoglio", "pescado")).toBe("pz_per_kg");
  });

  it("pescado SIN marisco keyword → g_per_piece", () => {
    expect(resolvePezzaturaMode("Branzino", "pescado")).toBe("g_per_piece");
    expect(resolvePezzaturaMode("Ricciola", "pescado")).toBe("g_per_piece");
    expect(resolvePezzaturaMode("Tonno rosso", "pescado")).toBe("g_per_piece");
  });

  it("carne + pieza entera keyword → g_per_piece", () => {
    expect(resolvePezzaturaMode("Pichón de Bresse", "carne")).toBe("g_per_piece");
    expect(resolvePezzaturaMode("Piccione", "carne")).toBe("g_per_piece");
    expect(resolvePezzaturaMode("Pollo entero", "carne")).toBe("g_per_piece");
    expect(resolvePezzaturaMode("Conejo", "carne")).toBe("g_per_piece");
    expect(resolvePezzaturaMode("Codorniz", "carne")).toBe("g_per_piece");
  });

  it("carne corte (sin pieza entera keyword) → null", () => {
    expect(resolvePezzaturaMode("Lomo de ternera", "carne")).toBe(null);
    expect(resolvePezzaturaMode("Costillas", "carne")).toBe(null);
    expect(resolvePezzaturaMode("Carpaccio", "carne")).toBe(null);
  });

  it("fruta → g_per_piece", () => {
    expect(resolvePezzaturaMode("Manzana", "fruta")).toBe("g_per_piece");
    expect(resolvePezzaturaMode("Limón", "fruta")).toBe("g_per_piece");
  });

  it("panaderia → g_per_piece", () => {
    expect(resolvePezzaturaMode("Brioche", "panaderia")).toBe("g_per_piece");
    expect(resolvePezzaturaMode("Pan rústico", "panaderia")).toBe("g_per_piece");
  });

  it("categorías sin pezzatura → null", () => {
    expect(resolvePezzaturaMode("Harina 00", "seco")).toBe(null);
    expect(resolvePezzaturaMode("Burrata", "lacteo")).toBe(null);
    expect(resolvePezzaturaMode("Aceite oliva", "vinagre_aceite")).toBe(null);
    expect(resolvePezzaturaMode("Salvia", "hierba")).toBe(null);
    expect(resolvePezzaturaMode("Pimienta negra", "especia")).toBe(null);
    expect(resolvePezzaturaMode("Zanahoria", "verdura")).toBe(null);
    expect(resolvePezzaturaMode("Sal Maldon", "otro")).toBe(null);
  });

  it("case-insensitive y con/sin acentos", () => {
    expect(resolvePezzaturaMode("PICCIONE", "carne")).toBe("g_per_piece");
    expect(resolvePezzaturaMode("pichón", "carne")).toBe("g_per_piece");
    expect(resolvePezzaturaMode("PICHON", "carne")).toBe("g_per_piece");
    expect(resolvePezzaturaMode("GAMBERI", "pescado")).toBe("pz_per_kg");
  });

  it("word-boundary: no matchea dentro de otra palabra", () => {
    // "gamba" no debería matchear en "gambaletti" si existiera tal producto
    expect(resolvePezzaturaMode("Gambaletti decorativos", "pescado")).toBe("g_per_piece");
  });
});

// ─────────── detectPezzaturaFromName ───────────

describe("detectPezzaturaFromName", () => {
  it("'Gamberi 15/20' + pescado → pz_per_kg 15/20", () => {
    const r = detectPezzaturaFromName("Gamberi 15/20", "pescado");
    expect(r).toEqual({ mode: "pz_per_kg", min: 15, max: 20 });
  });

  it("'Ricciola 4-6 kg' + pescado → g_per_piece 4000/6000", () => {
    const r = detectPezzaturaFromName("Ricciola 4-6 kg", "pescado");
    expect(r).toEqual({ mode: "g_per_piece", min: 4000, max: 6000 });
  });

  it("'Branzino 400/500 g' + pescado → g_per_piece 400/500", () => {
    const r = detectPezzaturaFromName("Branzino 400/500 g", "pescado");
    expect(r).toEqual({ mode: "g_per_piece", min: 400, max: 500 });
  });

  it("'Gamberi Rossi 20/30' + pescado → pz_per_kg 20/30", () => {
    const r = detectPezzaturaFromName("Gamberi Rossi 20/30", "pescado");
    expect(r).toEqual({ mode: "pz_per_kg", min: 20, max: 30 });
  });

  it("'Vieira U/8' + pescado → pz_per_kg 8/8", () => {
    const r = detectPezzaturaFromName("Vieira U/8", "pescado");
    expect(r).toEqual({ mode: "pz_per_kg", min: 8, max: 8 });
  });

  it("'Pichón 450 g' + carne → g_per_piece 450/450", () => {
    const r = detectPezzaturaFromName("Pichón 450 g", "carne");
    expect(r).toEqual({ mode: "g_per_piece", min: 450, max: 450 });
  });

  it("'Codorniz 200g' + carne (sin espacio) → g_per_piece 200/200", () => {
    const r = detectPezzaturaFromName("Codorniz 200g", "carne");
    expect(r).toEqual({ mode: "g_per_piece", min: 200, max: 200 });
  });

  it("nombres sin pezzatura → null", () => {
    expect(detectPezzaturaFromName("Aceite oliva extra virgen", "vinagre_aceite")).toBe(null);
    expect(detectPezzaturaFromName("Pasta de wasabi", "seco")).toBe(null);
    expect(detectPezzaturaFromName("Sal Maldon", "otro")).toBe(null);
    expect(detectPezzaturaFromName("Ricciola", "pescado")).toBe(null); // sin números
    expect(detectPezzaturaFromName("Branzino fresco", "pescado")).toBe(null);
  });

  it("falsos positivos descartados: 'Manzana 7-9 cm'", () => {
    // "cm" no es unidad de pezzatura → skip ese match → null
    expect(detectPezzaturaFromName("Manzana 7-9 cm", "fruta")).toBe(null);
  });

  it("'Harina 00' + seco → null (categoría no aplica)", () => {
    expect(detectPezzaturaFromName("Harina 00", "seco")).toBe(null);
  });

  it("decimales con coma en el nombre: 'Atún 2,5-4 kg'", () => {
    const r = detectPezzaturaFromName("Atún 2,5-4 kg", "pescado");
    expect(r).toEqual({ mode: "g_per_piece", min: 2500, max: 4000 });
  });
});

// ─────────── parsePezzatura — formatos básicos ───────────

describe("parsePezzatura — separadores", () => {
  const cat: "pescado" = "pescado";
  const marisco = "Gamberi";

  it("'/' separador", () => {
    expect(parsePezzatura("15/20", cat, marisco)).toEqual({
      mode: "pz_per_kg", min: 15, max: 20,
    });
  });

  it("'-' separador", () => {
    expect(parsePezzatura("15-20", cat, marisco)).toEqual({
      mode: "pz_per_kg", min: 15, max: 20,
    });
  });

  it("' a ' separador", () => {
    expect(parsePezzatura("15 a 20", cat, marisco)).toEqual({
      mode: "pz_per_kg", min: 15, max: 20,
    });
  });

  it("espacio único separador", () => {
    expect(parsePezzatura("15 20", cat, marisco)).toEqual({
      mode: "pz_per_kg", min: 15, max: 20,
    });
  });
});

describe("parsePezzatura — unidades de peso", () => {
  it("'400/500 g' → 400/500", () => {
    expect(parsePezzatura("400/500 g", "pescado", "Branzino")).toEqual({
      mode: "g_per_piece", min: 400, max: 500,
    });
  });

  it("'2-4 kg' → 2000/4000", () => {
    expect(parsePezzatura("2-4 kg", "pescado", "Ricciola")).toEqual({
      mode: "g_per_piece", min: 2000, max: 4000,
    });
  });

  it("decimal con coma: '2,5/3 kg' → 2500/3000", () => {
    expect(parsePezzatura("2,5/3 kg", "pescado", "Ricciola")).toEqual({
      mode: "g_per_piece", min: 2500, max: 3000,
    });
  });

  it("decimal con punto: '2.5/3 kg' → 2500/3000", () => {
    expect(parsePezzatura("2.5/3 kg", "pescado", "Ricciola")).toEqual({
      mode: "g_per_piece", min: 2500, max: 3000,
    });
  });

  it("alias 'gr', 'gramos', 'grammi', 'grams' → todos g", () => {
    const exp = { mode: "g_per_piece", min: 400, max: 500 };
    expect(parsePezzatura("400/500 gr", "pescado", "Branzino")).toEqual(exp);
    expect(parsePezzatura("400/500 gramos", "pescado", "Branzino")).toEqual(exp);
    expect(parsePezzatura("400/500 grammi", "pescado", "Branzino")).toEqual(exp);
    expect(parsePezzatura("400/500 grams", "pescado", "Branzino")).toEqual(exp);
  });

  it("case-insensitive kg/Kg/KG", () => {
    const exp = { mode: "g_per_piece", min: 2000, max: 4000 };
    expect(parsePezzatura("2-4 kg", "pescado", "Ricciola")).toEqual(exp);
    expect(parsePezzatura("2-4 Kg", "pescado", "Ricciola")).toEqual(exp);
    expect(parsePezzatura("2-4 KG", "pescado", "Ricciola")).toEqual(exp);
  });
});

describe("parsePezzatura — U/X (Under)", () => {
  it("'U/8' + marisco → pz_per_kg 8/8", () => {
    expect(parsePezzatura("U/8", "pescado", "Vieira")).toEqual({
      mode: "pz_per_kg", min: 8, max: 8,
    });
  });

  it("'u/12' lowercase", () => {
    expect(parsePezzatura("u/12", "pescado", "Gamberi")).toEqual({
      mode: "pz_per_kg", min: 12, max: 12,
    });
  });

  it("U/X en g_per_piece → null (no aplica)", () => {
    expect(parsePezzatura("U/8", "pescado", "Branzino")).toBe(null);
    expect(parsePezzatura("U/8", "carne", "Pichón")).toBe(null);
  });
});

describe("parsePezzatura — valor único con unidad", () => {
  it("'60 g/pz' → g_per_piece 60/60", () => {
    expect(parsePezzatura("60 g/pz", "carne", "Codorniz")).toEqual({
      mode: "g_per_piece", min: 60, max: 60,
    });
  });

  it("'3 kg/pz' → g_per_piece 3000/3000", () => {
    expect(parsePezzatura("3 kg/pz", "pescado", "Atún")).toEqual({
      mode: "g_per_piece", min: 3000, max: 3000,
    });
  });

  it("'500 g' (sin /pz) → g_per_piece 500/500", () => {
    expect(parsePezzatura("500 g", "carne", "Pichón")).toEqual({
      mode: "g_per_piece", min: 500, max: 500,
    });
  });

  it("'1 kg' → g_per_piece 1000/1000", () => {
    expect(parsePezzatura("1 kg", "pescado", "Branzino")).toEqual({
      mode: "g_per_piece", min: 1000, max: 1000,
    });
  });
});

describe("parsePezzatura — tolerancia espacios", () => {
  it("sin espacio antes de kg: '2kg/pz' → g_per_piece 2000/2000", () => {
    // Spec sección 2 lista explícitamente "2kg/pz" como formato tolerado.
    expect(parsePezzatura("2kg/pz", "pescado", "Atún")).toEqual({
      mode: "g_per_piece", min: 2000, max: 2000,
    });
  });

  it("varios espacios: '  2  /  4  kg  '", () => {
    expect(parsePezzatura("  2  /  4  kg  ", "pescado", "Ricciola")).toEqual({
      mode: "g_per_piece", min: 2000, max: 4000,
    });
  });

  it("espacio antes y después de unit: '2 kg / pz' (con override pz)", () => {
    expect(parsePezzatura("2 kg / pz", "pescado", "Atún")).toEqual({
      mode: "g_per_piece", min: 2000, max: 2000,
    });
  });
});

describe("parsePezzatura — resolución por categoría sin unit", () => {
  it("'10/15' en marisco → pz_per_kg 10/15", () => {
    expect(parsePezzatura("10/15", "pescado", "Gamberi")).toEqual({
      mode: "pz_per_kg", min: 10, max: 15,
    });
  });

  it("'10/15' en pescado-no-marisco (≤100) → asume kg → 10000/15000", () => {
    expect(parsePezzatura("10/15", "pescado", "Branzino")).toEqual({
      mode: "g_per_piece", min: 10000, max: 15000,
    });
  });

  it("'400/500' en pescado-no-marisco (>100) → asume g → 400/500", () => {
    expect(parsePezzatura("400/500", "pescado", "Branzino")).toEqual({
      mode: "g_per_piece", min: 400, max: 500,
    });
  });
});

describe("parsePezzatura — casos negativos", () => {
  it("input vacío → null", () => {
    expect(parsePezzatura("", "pescado", "Gamberi")).toBe(null);
    expect(parsePezzatura("   ", "pescado", "Gamberi")).toBe(null);
  });

  it("texto sin números → null", () => {
    expect(parsePezzatura("trufa blanca", "pescado", "Gamberi")).toBe(null);
    expect(parsePezzatura("abc", "pescado", "Gamberi")).toBe(null);
  });

  it("max < min → null", () => {
    expect(parsePezzatura("20/10", "pescado", "Gamberi")).toBe(null);
    expect(parsePezzatura("500/300 g", "pescado", "Branzino")).toBe(null);
  });

  it("unidad inconsistente con modo: 'g' en marisco → null", () => {
    // Marisco es pz_per_kg; unit g sería un g_per_piece, conflicto.
    expect(parsePezzatura("400/500 g", "pescado", "Gamberi")).toBe(null);
  });

  it("unidad inconsistente: 'pz' en g_per_piece → null", () => {
    expect(parsePezzatura("15/20 pz", "pescado", "Branzino")).toBe(null);
  });

  it("categoría sin pezzatura → null", () => {
    expect(parsePezzatura("15/20", "seco", "Harina")).toBe(null);
    expect(parsePezzatura("400/500 g", "vinagre_aceite", "Aceite")).toBe(null);
  });

  it("valores no positivos → null", () => {
    expect(parsePezzatura("0/10", "pescado", "Gamberi")).toBe(null);
    expect(parsePezzatura("-5/10", "pescado", "Gamberi")).toBe(null);
  });
});

// ─────────── formatPezzatura ───────────

describe("formatPezzatura", () => {
  it("pz_per_kg rango → '15/20'", () => {
    expect(formatPezzatura({ mode: "pz_per_kg", min: 15, max: 20 })).toBe("15/20");
  });

  it("pz_per_kg degenerado → '20/20' (simétrico para round-trip estable)", () => {
    expect(formatPezzatura({ mode: "pz_per_kg", min: 20, max: 20 })).toBe("20/20");
  });

  it("g_per_piece ≥1000 rango → '2-4 kg'", () => {
    expect(formatPezzatura({ mode: "g_per_piece", min: 2000, max: 4000 })).toBe("2-4 kg");
  });

  it("g_per_piece ≥1000 con decimal → '2,5-4 kg'", () => {
    expect(formatPezzatura({ mode: "g_per_piece", min: 2500, max: 4000 })).toBe("2,5-4 kg");
  });

  it("g_per_piece ≥1000 degenerado → '3 kg/pz'", () => {
    expect(formatPezzatura({ mode: "g_per_piece", min: 3000, max: 3000 })).toBe("3 kg/pz");
  });

  it("g_per_piece <1000 rango → '400/500 g'", () => {
    expect(formatPezzatura({ mode: "g_per_piece", min: 400, max: 500 })).toBe("400/500 g");
  });

  it("g_per_piece <1000 degenerado → '60 g/pz'", () => {
    expect(formatPezzatura({ mode: "g_per_piece", min: 60, max: 60 })).toBe("60 g/pz");
  });
});

// ─────────── Round-trip: parse → format → parse ───────────

describe("round-trip parse → format → parse", () => {
  type Case = { input: string; category: "pescado" | "carne" | "fruta"; name: string };
  const cases: Case[] = [
    { input: "15/20", category: "pescado", name: "Gamberi" },
    { input: "10/15", category: "pescado", name: "Scampi" },
    { input: "U/8", category: "pescado", name: "Vieira" },
    { input: "400/500 g", category: "pescado", name: "Branzino" },
    { input: "2-4 kg", category: "pescado", name: "Ricciola" },
    { input: "2,5-4 kg", category: "pescado", name: "Tonno" },
    { input: "60 g/pz", category: "carne", name: "Codorniz" },
    { input: "450 g", category: "carne", name: "Pichón" },
    { input: "3 kg/pz", category: "pescado", name: "Atún" },
    { input: "1 kg", category: "pescado", name: "Branzino" },
    { input: "200 g", category: "fruta", name: "Manzana" },
    { input: "20/30", category: "pescado", name: "Gamberi Rossi" },
  ];

  for (const c of cases) {
    it(`'${c.input}' (${c.name}) — round-trip estable`, () => {
      const first = parsePezzatura(c.input, c.category, c.name);
      expect(first).not.toBe(null);
      const rendered = formatPezzatura(first as PezzaturaValue);
      const second = parsePezzatura(rendered, c.category, c.name);
      expect(second).toEqual(first);
    });
  }
});
