import { describe, test, expect } from "vitest";
import {
  splitAttributes,
  attributesMatch,
  baseNameMatches,
  hasDiscriminators,
  toBaseKey,
} from "./atributos";

// ─────────────────────────────────────────────────────────────────────────
// EL CASO DE ANDY — criterio de éxito del escáner de facturas.
//
// Tres descripciones que un proveedor puede escribir. Las dos primeras son
// EL MISMO artículo escrito distinto; la tercera es OTRO artículo de la
// misma familia. Si el sistema no distingue estos dos casos, o fusiona
// productos que no debe, o duplica el banco.
// ─────────────────────────────────────────────────────────────────────────

describe("caso Andy — gambero rosso", () => {
  const A = splitAttributes("GAMB.ROSSO MAZARA CAL.3");
  const B = splitAttributes("Gambero rosso di Mazzara 3ra");
  const C = splitAttributes("GAMBERI ROSSI SICILIA 15/20");

  test("A y B son la MISMA familia pese a la abreviatura", () => {
    expect(baseNameMatches(A.baseName, B.baseName)).toBe(true);
  });

  test("A y B son el MISMO producto (procedencia y calibre coinciden)", () => {
    expect(A.origen).toBe("mazara del vallo");
    expect(B.origen).toBe("mazara del vallo");
    expect(A.calibreLabel).toBe("cal.3");
    expect(B.calibreLabel).toBe("cal.3");
    expect(attributesMatch(A, B)).toBe(true);
  });

  test("C es la misma familia que B — singular y plural colapsan", () => {
    expect(B.baseKey).toBe("gamber ross");
    expect(C.baseKey).toBe("gamber ross");
  });

  test("C es OTRO producto: distinta procedencia y distinto calibre", () => {
    expect(C.origen).toBe("sicilia");
    expect(C.calibreLabel).toBe("15/20");
    expect(attributesMatch(B, C)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Extracción de calibre
// ─────────────────────────────────────────────────────────────────────────

describe("calibre", () => {
  test.each([
    ["Gamberi 15/20", "15/20"],
    ["Scampi U/8", "u/8"],
    ["Gambero rosso cal. 3", "cal.3"],
    ["Gambero CAL.3", "cal.3"],
    ["Vongole tg 2", "cal.2"],
    ["Gambero 3ra", "cal.3"],
    ["Gambero 1a", "cal.1"],
    ["Gambero 2da", "cal.2"],
    ["Gamberi prima scelta", "cal.1"],
    ["Ricciola 2-4 kg", "2-4 kg"],
    ["Branzino 400/500 g", "400-500 g"],
  ])("%s → %s", (input, expected) => {
    expect(splitAttributes(input).calibreLabel).toBe(expected);
  });

  // Regresión: el sufijo ordinal debe ir PEGADO al número. Con "\s*" en
  // medio, el rango "2 a 4 kg" se leía como grado 2.
  test("un rango escrito 'X a Y' no se confunde con un grado", () => {
    expect(splitAttributes("Ricciola 2 a 4 kg").calibreLabel).not.toBe("cal.2");
  });

  // Un calibre es un rango ascendente. Sin esa regla, una fecha en la
  // descripción se leería como calibre.
  test("una fecha 15/07 no es un calibre", () => {
    expect(splitAttributes("Merluzzo lotto 15/07").calibreLabel).toBeNull();
  });

  test("una fracción 1/2 no es un calibre", () => {
    expect(splitAttributes("Pollo 1/2").calibreLabel).toBeNull();
  });

  test("sin calibre devuelve null", () => {
    expect(splitAttributes("Farina 00").calibreLabel).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Peso del bulto — se extrae ANTES que el calibre para que "CT 5KG" no se
// lea como el calibre de la pieza.
// ─────────────────────────────────────────────────────────────────────────

describe("packG", () => {
  test.each([
    ["Gamberi rossi CT 5KG", 5000],
    ["Gamberi CASSA DA 5 KG", 5000],
    ["Burrata CONF. 500 G", 500],
    ["Pomodorini x 3 kg", 3000],
  ])("%s → %s g", (input, expected) => {
    expect(splitAttributes(input).packG).toBe(expected);
  });

  test("el peso del bulto no se confunde con el calibre", () => {
    const r = splitAttributes("GAMBERI ROSSI 15/20 CT 5KG");
    expect(r.packG).toBe(5000);
    expect(r.calibreLabel).toBe("15/20");
  });

  test("sin bulto devuelve null", () => {
    expect(splitAttributes("Gamberi rossi").packG).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Procedencia
// ─────────────────────────────────────────────────────────────────────────

describe("origen", () => {
  test.each([
    ["Gambero di Mazara del Vallo", "mazara del vallo"],
    ["Gambero mazzara", "mazara del vallo"],
    ["Gambero rosso siciliano", "sicilia"],
    ["Gambero argentino", "argentina"],
    ["Salmone norvegese", "norvegia"],
    ["Cozze galiziane", "galizia"],
    ["Pomodorini del piennolo", "piennolo"],
  ])("%s → %s", (input, expected) => {
    expect(splitAttributes(input).origen).toBe(expected);
  });

  test("gana la variante más larga: no queda 'del vallo' colgando", () => {
    const r = splitAttributes("Gambero rosso di Mazara del Vallo");
    expect(r.origen).toBe("mazara del vallo");
    expect(r.baseName).not.toContain("vallo");
  });

  test("la denominación se anexa a la procedencia", () => {
    expect(splitAttributes("Prosciutto di Parma DOP").origen).toBe("parma dop");
  });

  test("la denominación vale sola si no se nombra el lugar", () => {
    expect(splitAttributes("Prosciutto crudo DOP").origen).toBe("dop");
  });

  test("sin procedencia devuelve null", () => {
    expect(splitAttributes("Farina di grano tenero").origen).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Conservación — tres valores, no dos: descongelado no es congelado.
// ─────────────────────────────────────────────────────────────────────────

describe("conservacion", () => {
  test.each([
    ["Gambero rosso fresco", "fresco"],
    ["Gamberi freschi", "fresco"],
    ["Gambero congelato", "congelado"],
    ["Gamberi surgelati", "congelado"],
    ["Gamberi IQF", "congelado"],
    ["Gambero decongelato", "descongelado"],
  ])("%s → %s", (input, expected) => {
    expect(splitAttributes(input).conservacion).toBe(expected);
  });

  test("descongelado NO es congelado — son productos distintos", () => {
    const cong = splitAttributes("Gambero rosso congelato");
    const desc = splitAttributes("Gambero rosso decongelato");
    expect(attributesMatch(cong, desc)).toBe(false);
  });

  test("fresco y congelado son productos distintos", () => {
    const a = splitAttributes("Gambero rosso fresco");
    const b = splitAttributes("Gambero rosso congelato");
    expect(a.baseKey).toBe(b.baseKey); // misma familia
    expect(attributesMatch(a, b)).toBe(false); // distinto producto
  });
});

// ─────────────────────────────────────────────────────────────────────────
// baseKey — la clave de agrupación
// ─────────────────────────────────────────────────────────────────────────

describe("baseKey", () => {
  // El bug que motivó cortar la vocal en vez de singularizar: con una regla
  // "-i → -o", "pesce" caía en "pesca" y "pesci" en "pesco". El singular y
  // el plural de la MISMA palabra iban a claves distintas.
  test.each([
    ["gambero", "gamberi"],
    ["pesce", "pesci"],
    ["cozza", "cozze"],
    ["gamba", "gambas"],
  ])("singular y plural comparten clave: %s / %s", (sing, plur) => {
    expect(toBaseKey(sing)).toBe(toBaseKey(plur));
  });

  test("no corta por debajo de 3 letras", () => {
    expect(toBaseKey("uva")).toBe("uva");
  });

  test("quita ruido de embalaje y unidades", () => {
    expect(splitAttributes("Gamberi rossi kg pz conf").baseName).toBe("gamberi rossi");
  });

  test("quita códigos de artículo del proveedor", () => {
    expect(splitAttributes("ART4471 Gamberi rossi").baseName).toBe("gamberi rossi");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// baseNameMatches — tolerancia a abreviaturas, estricto en lo demás
// ─────────────────────────────────────────────────────────────────────────

describe("baseNameMatches", () => {
  test("tolera abreviaturas del proveedor", () => {
    expect(baseNameMatches("gamb rosso", "gambero rosso")).toBe(true);
  });

  test("tolera singular/plural", () => {
    expect(baseNameMatches("gamberi rossi", "gambero rosso")).toBe(true);
  });

  // Fusionar de más es el error caro: un producto mal fusionado mete un
  // precio equivocado en todos los platos que lo usan.
  test("un nombre incompleto NO reclama a la familia entera", () => {
    expect(baseNameMatches("gambero", "gambero rosso")).toBe(false);
  });

  test("un calificativo de más tampoco empareja", () => {
    expect(baseNameMatches("gambero rosso crudo", "gambero rosso")).toBe(false);
  });

  test("familias distintas no emparejan", () => {
    expect(baseNameMatches("gambero rosso", "scampo rosso")).toBe(false);
  });

  test("vacío nunca empareja", () => {
    expect(baseNameMatches("", "gambero rosso")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// attributesMatch — un atributo ausente no separa; dos presentes distintos sí
// ─────────────────────────────────────────────────────────────────────────

describe("attributesMatch", () => {
  const base = { origen: null, calibreLabel: null, conservacion: null } as const;

  test("todo ausente empareja", () => {
    expect(attributesMatch(base, base)).toBe(true);
  });

  test("un lado sin informar no invalida el match", () => {
    expect(
      attributesMatch({ ...base, origen: "sicilia" }, base),
    ).toBe(true);
  });

  test("dos procedencias distintas separan", () => {
    expect(
      attributesMatch(
        { ...base, origen: "sicilia" },
        { ...base, origen: "argentina" },
      ),
    ).toBe(false);
  });

  test("dos calibres distintos separan", () => {
    expect(
      attributesMatch(
        { ...base, calibreLabel: "15/20" },
        { ...base, calibreLabel: "cal.3" },
      ),
    ).toBe(false);
  });
});

describe("hasDiscriminators", () => {
  test("sin ningún atributo no se puede desambiguar", () => {
    expect(hasDiscriminators(splitAttributes("gambero rosso"))).toBe(false);
  });

  test("con procedencia sí", () => {
    expect(hasDiscriminators(splitAttributes("gambero rosso di mazara"))).toBe(true);
  });

  test("con calibre sí", () => {
    expect(hasDiscriminators(splitAttributes("gambero rosso 15/20"))).toBe(true);
  });
});
