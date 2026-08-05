import { describe, expect, it } from "vitest";
import { findMatch, levenshtein, type MatchCandidate } from "../matching";

const cand = (id: string, name: string, aliases: string[] = []): MatchCandidate => ({
  id,
  name,
  aliases,
});

describe("levenshtein (regresión)", () => {
  it("distancias básicas", () => {
    expect(levenshtein("ricciola", "ricciola")).toBe(0);
    expect(levenshtein("riciola", "ricciola")).toBe(1);
    expect(levenshtein("", "abc")).toBe(3);
  });
});

describe("findMatch — comportamiento existente (frase entera)", () => {
  it("exact: distancia 0 tras normalizar", () => {
    const r = findMatch("Trufa Negra", [cand("p1", "trufa negra")]);
    expect(r.level).toBe("exact");
    expect(r.productId).toBe("p1");
  });

  it("probable por typo (distancia 1)", () => {
    const r = findMatch("riciola", [cand("p1", "Ricciola")]);
    expect(r.level).toBe("probable");
    expect(r.productId).toBe("p1");
  });

  it("none cuando no hay nada parecido", () => {
    const r = findMatch("azafran", [cand("p1", "chocolate 70%")]);
    expect(r.level).toBe("none");
    expect(r.productId).toBeNull();
  });

  it("query vacío o solo espacios → none", () => {
    expect(findMatch("   ", [cand("p1", "sal")]).level).toBe("none");
  });
});

describe("findMatch — tokens (caso ricciola real de prod)", () => {
  it("frase descriptiva larga matchea el producto corto del banco", () => {
    // El caso exacto que duplicó el banco de Andy (12-jun).
    const r = findMatch("lomo de ricciola limpio con piel — aprox. 600 g neto", [
      cand("p1", "Ricciola"),
    ]);
    expect(r.level).toBe("probable");
    expect(r.productId).toBe("p1");
  });

  it("dos frases descriptivas de la misma ricciola se reconocen entre sí", () => {
    // Banco sucio (nombre largo) vs línea nueva distinta — 2 de 3 tokens
    // significativos compartidos {lomo, ricciola} → 0.67 ≥ 0.6.
    const r = findMatch("ricciola frollata (lomo limpio, piel retirada)", [
      cand("p1", "Lomo de Ricciola fresquísima"),
    ]);
    expect(r.level).toBe("probable");
    expect(r.productId).toBe("p1");
  });

  it("fuzzy por token: frollata ≈ frollada (re-guardado del 15-jun)", () => {
    const r = findMatch("ricciola frollada (lomo limpio, piel retirada post-frolladura)", [
      cand("p1", "ricciola frollata (lomo limpio, piel retirada)"),
    ]);
    expect(r.level).toBe("probable");
    expect(r.productId).toBe("p1");
  });

  it("NO pregunta por productos distintos con palabra genérica compartida", () => {
    // 1/2 = 0.5 < 0.6 → none. El aceite de girasol NO es el de oliva.
    const r = findMatch("aceite de girasol", [cand("p1", "aceite de oliva")]);
    expect(r.level).toBe("none");
  });

  it("tokens cortos no hacen fuzzy: piel ≠ miel como token", () => {
    // "miel de piel de naranja" comparte "naranja" 1/2=0.5 y "piel"≠"miel"
    // (len 4 < 5 → sin fuzzy). Whole-string también lejos → none.
    const r = findMatch("piel de naranja confitada", [cand("p1", "miel de azahar")]);
    expect(r.level).toBe("none");
  });

  it("unidades y stopwords no cuentan como tokens", () => {
    // {ricciola} vs {ricciola} = 1.0 aunque la frase esté llena de ruido.
    const r = findMatch("Ricciola — aprox. 600 g neto", [cand("p1", "Ricciola")]);
    expect(r.level).toBe("probable");
    expect(r.productId).toBe("p1");
  });

  it("matchea también contra aliases por tokens", () => {
    const r = findMatch("ricciola fresca", [
      cand("p1", "Pesce bianco", ["ricciola fresca del mediterraneo"]),
    ]);
    expect(r.level).toBe("probable");
    expect(r.productId).toBe("p1");
  });

  it("plurales por token: trufas negras ≈ trufa negra", () => {
    const r = findMatch("trufas negras", [cand("p1", "trufa negra")]);
    // exact o probable según el camino, pero JAMÁS none ni producto nuevo.
    expect(r.level === "exact" || r.level === "probable").toBe(true);
    expect(r.productId).toBe("p1");
  });

  it("exact le gana a probable entre candidatos", () => {
    const r = findMatch("ricciola", [
      cand("p1", "Lomo de Ricciola fresquísima"),
      cand("p2", "Ricciola"),
    ]);
    expect(r.level).toBe("exact");
    expect(r.productId).toBe("p2");
  });

  it("entre dos probables gana el de mayor solapamiento", () => {
    const r = findMatch("ricciola frollata lomo", [
      cand("p1", "Lomo de Ricciola fresquísima"), // {lomo,ricciola,fresquisima}: 2/3
      cand("p2", "ricciola frollata"), // {ricciola,frollata}: 2/2 = 1.0
    ]);
    expect(r.level).toBe("probable");
    expect(r.productId).toBe("p2");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Desambiguación entre hermanos de familia (Andy, jul 2026).
//
// "si hay varios gamberos pero en la receta no marca el nombre en específico
//  no se lo invente, sino que el sistema te pida cuál es el gambero a usar"
// ─────────────────────────────────────────────────────────────────────────

describe("findMatch — familia con varios productos", () => {
  const banco = [
    cand("g1", "Gambero rosso Mazara 3ra"),
    cand("g2", "Gambero rosso Sicilia 15/20"),
    cand("g3", "Gambero rosso Argentina 20/30"),
    cand("g4", "Gambero rosso Sanremo"),
  ];

  it("query sin especificar → ambiguo, NO elige por su cuenta", () => {
    const r = findMatch("gambero rosso", banco);
    expect(r.level).toBe("ambiguo");
    expect(r.productId).toBeNull();
    expect(r.candidates.map((c) => c.id).sort()).toEqual(["g1", "g2", "g3", "g4"]);
  });

  it("los candidatos llegan con procedencia y calibre para poder elegir", () => {
    const r = findMatch("gambero rosso", banco);
    const mazara = r.candidates.find((c) => c.id === "g1");
    expect(mazara?.origen).toBe("mazara del vallo");
    expect(mazara?.calibreLabel).toBe("cal.3");
  });

  it("query que sí especifica → enlaza sin molestar", () => {
    const r = findMatch("gambero rosso di mazzara 3ra", banco);
    expect(r.level).not.toBe("ambiguo");
    expect(r.productId).toBe("g1");
  });

  it("basta el calibre para desambiguar", () => {
    const r = findMatch("gambero rosso 15/20", banco);
    expect(r.level).not.toBe("ambiguo");
    expect(r.productId).toBe("g2");
  });

  it("procedencia que el banco no tiene → ofrece la familia igual", () => {
    // El sheet siempre lleva la salida "ninguna, crear nuevo".
    const r = findMatch("gambero rosso di norvegia", banco);
    expect(r.level).toBe("ambiguo");
    expect(r.candidates).toHaveLength(4);
  });

  it("un solo producto en la familia → comportamiento de siempre", () => {
    const r = findMatch("gambero rosso", [cand("g1", "Gambero rosso Mazara 3ra")]);
    expect(r.level).not.toBe("ambiguo");
    expect(r.productId).toBe("g1");
  });

  // El cambio de comportamiento más delicado del lote: hasta ahora un nombre
  // idéntico se enlazaba en silencio. Con hermanos en el banco ya no alcanza.
  it("ni siquiera un nombre idéntico enlaza solo si hay hermanos", () => {
    const r = findMatch("Gambero rosso", [
      cand("g0", "Gambero rosso"),
      cand("g1", "Gambero rosso Mazara 3ra"),
    ]);
    expect(r.level).toBe("ambiguo");
    expect(r.productId).toBeNull();
  });

  it("productos de otra familia no entran en la elección", () => {
    const r = findMatch("gambero rosso", [...banco, cand("s1", "Scampo 15/20")]);
    expect(r.candidates.map((c) => c.id)).not.toContain("s1");
  });
});
