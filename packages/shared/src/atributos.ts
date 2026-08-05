// Factorización de descripciones de proveedor en atributos estructurados.
//
// El problema (Andy, jul 2026): cada proveedor nombra distinto lo mismo, y
// además el precio depende de la procedencia y del calibre:
//
//   "GAMB.ROSSO MAZARA CAL.3"        → gambero rosso · mazara del vallo · cal.3
//   "Gambero rosso di Mazzara 3ra"   → gambero rosso · mazara del vallo · 3ra
//   "GAMBERI ROSSI SICILIA 15/20"    → gambero rosso · sicilia · 15/20
//
// Los dos primeros son EL MISMO artículo escrito distinto; el tercero es OTRO
// artículo (misma familia, otra procedencia y otro calibre). La distancia de
// texto sola no distingue esos dos casos — por eso sacamos procedencia,
// calibre y conservación FUERA del nombre y comparamos por separado:
//
//   baseName igual + atributos iguales     → es el mismo producto
//   baseName igual + atributos distintos   → hermano de grupo, producto nuevo
//
// Es el mismo patrón que `pezzatura.ts` ya aplica al calibre embebido en el
// nombre, extendido a procedencia y conservación y sin depender de la
// categoría (en una factura todavía no sabemos qué categoría tiene la línea).

import { normalizeForMatch } from "./normalize";

// "descongelado" es su propia categoría a propósito: legalmente y en precio,
// un producto descongelado NO es lo mismo que uno congelado ni que uno fresco.
// Meterlo en "congelado" fusionaría dos artículos distintos.
export type Conservacion = "fresco" | "congelado" | "descongelado";

export type ProductAttributes = {
  // Nombre de familia legible, sin atributos ni ruido, tal como se puede
  // mostrar. "gamberi rossi" se queda "gamberi rossi" — NO se singulariza,
  // porque adivinar el singular italiano desde el plural es imposible
  // (-i puede venir de -o o de -e) y produce formas inventadas.
  baseName: string;
  // Clave de agrupación: baseName con la vocal final de cada token quitada.
  // "gambero rosso" y "gamberi rossi" colapsan ambos a "gamber ross", que es
  // lo único que necesitamos para saber que son la misma familia.
  baseKey: string;
  // Procedencia canónica. "mazara del vallo" (las variantes de escritura del
  // proveedor colapsan acá).
  origen: string | null;
  // Calibre TAL COMO VIENE ("3ra", "15/20", "cal.3", "2-4 kg"). Es un rótulo,
  // no un número: no existe tabla universal grado→pz/kg por especie e
  // inventarla corrompería el costeo. Sirve para discriminar y para mostrar.
  calibreLabel: string | null;
  conservacion: Conservacion | null;
  // Peso del collo/caja en gramos, cuando la línea se factura por bulto.
  // Necesario para convertir €/caja a €/kg.
  packG: number | null;
};

// ─────────── Léxico de procedencias ───────────
//
// Clave = forma canónica; valores = variantes de escritura que se ven en las
// facturas (incluidos errores frecuentes: "mazzara" con doble z). Se matchea
// con límites de palabra, igual que MARISCO_KEYWORDS en pezzatura.ts.

const PROCEDENCIAS: Record<string, readonly string[]> = {
  // Italia — pesca
  "mazara del vallo": ["mazara del vallo", "mazzara del vallo", "mazara", "mazzara"],
  sicilia: ["sicilia", "siciliano", "siciliana", "siciliani", "sicule", "siculo"],
  sanremo: ["sanremo", "san remo"],
  cetara: ["cetara"],
  gallipoli: ["gallipoli"],
  "porto santo spirito": ["porto santo spirito"],
  mediterraneo: ["mediterraneo", "mediterranea", "mediterraneo occidentale"],
  adriatico: ["adriatico", "adriatica"],
  tirreno: ["tirreno", "tirrenico"],
  // Italia — tierra
  piennolo: ["piennolo", "del piennolo"],
  pachino: ["pachino"],
  norcia: ["norcia"],
  parma: ["parma"],
  bronte: ["bronte"],
  // Resto de Europa
  norvegia: ["norvegia", "norvegese", "noruega", "noruego"],
  scozia: ["scozia", "scozzese", "escocia", "escoces"],
  irlanda: ["irlanda", "irlandese", "irlandes"],
  bretagna: ["bretagna", "bretone", "bretana"],
  galizia: ["galizia", "galiziano", "galicia", "gallego"],
  olanda: ["olanda", "olandese", "holanda", "holandes"],
  francia: ["francia", "francese", "frances"],
  spagna: ["spagna", "spagnolo", "espana", "espanol"],
  grecia: ["grecia", "greco", "griego"],
  islanda: ["islanda", "islandese", "islandia"],
  // Fuera de Europa
  argentina: ["argentina", "argentino"],
  ecuador: ["ecuador", "ecuadoriano"],
  senegal: ["senegal", "senegalese"],
  vietnam: ["vietnam", "vietnamita"],
  madagascar: ["madagascar"],
  // Sin acentos en la clave: normalizeForMatch quita diacríticos, así que un
  // canónico "perù" jamás matchearía contra el texto ya normalizado.
  peru: ["peru", "peruano", "peruviano"],
  // Genérico: producto local. Vale como discriminador aunque no sea un lugar.
  nostrano: ["nostrano", "nostrana", "locale", "km 0", "km0"],
};

// Denominaciones de origen. No son un lugar pero discriminan precio igual.
const DENOMINACIONES = ["dop", "igp", "docg", "doc", "stg", "igt"];

// ─────────── Conservación ───────────

const CONSERVACION_WORDS: Record<Conservacion, readonly string[]> = {
  descongelado: [
    "decongelato", "decongelati", "decongelata",
    "descongelado", "descongelada", "scongelato", "scongelati",
  ],
  congelado: [
    "congelato", "congelati", "congelata", "congelado", "congelada",
    "surgelato", "surgelati", "surgelata", "surgelado",
    "iqf", "cong",
  ],
  fresco: ["fresco", "fresca", "freschi", "fresche", "fresc"],
};

// ─────────── Ruido a quitar del baseName ───────────
//
// Palabras que no identifican el producto: estado del embalaje, calidades
// genéricas y unidades sueltas. NO incluye cosas que sí cambian el producto
// (intero/sfilettato/filetto/lomo) — esas quedan en el baseName a propósito,
// porque un filete y un pescado entero son productos distintos para el chef.
const NOISE_WORDS = new Set([
  "sottovuoto", "sotto", "vuoto", "atm", "busta", "vaschetta", "vasch",
  "extra", "qualita", "qualità", "scelta", "prima", "selezione", "select",
  "bio", "biologico", "biologica", "art", "cod", "codice", "rif",
  "kg", "kgs", "gr", "g", "grammi", "ml", "lt", "l", "cl",
  "pz", "pezzi", "pezzo", "pieza", "piezas", "ud", "uds", "n", "nr", "num",
  "ct", "cf", "conf", "confezione", "cassa", "cassetta", "collo", "colli",
  "box", "cartone", "cart", "scatola", "imballo", "peso", "variabile", "var",
  "circa", "ca", "aprox", "approx", "netto", "neto", "lordo",
  "de", "del", "della", "dello", "dei", "degli", "delle", "di", "da",
  "la", "el", "lo", "il", "le", "gli", "i", "un", "una", "uno",
  "con", "sin", "senza", "al", "a", "e", "y", "ed", "in", "per",
]);

// ─────────── Helpers ───────────

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Match con límites de palabra. Mismo criterio que pezzatura.ts:matchKeyword —
// "gamba" matchea "gamba rossa" pero no "gambaletto".
function wordRe(keyword: string): RegExp {
  return new RegExp(`\\b${escapeRe(keyword)}\\b`);
}

function parseDecimal(s: string): number {
  return Number(s.replace(",", "."));
}

// ─────────── 1. Peso del collo ───────────
//
// Se busca ANTES que el calibre: "CT 5KG" es el peso de la caja, no el
// calibre de la pieza, y sin este paso el extractor de calibre se lo comería.

const PACK_MARKERS = [
  "ct", "cf", "conf", "confezione", "cassa", "cassetta", "collo",
  "box", "cartone", "scatola", "imballo", "sacco", "secchio", "secchiello",
];

const PACK_RE = new RegExp(
  `\\b(?:${PACK_MARKERS.map(escapeRe).join("|")})\\.?\\s*(?:da\\s*|x\\s*)?(\\d+(?:[.,]\\d+)?)\\s*(kg|kgs|gr|g|grammi)\\b`,
);
// "x 5 kg" / "* 5kg" al final — formato de bulto sin la palabra caja.
const PACK_X_RE = /(?:^|\s)[x*]\s*(\d+(?:[.,]\d+)?)\s*(kg|kgs|gr|g|grammi)\b/;

function extractPack(s: string): { packG: number | null; rest: string } {
  for (const re of [PACK_RE, PACK_X_RE]) {
    const m = s.match(re);
    if (!m) continue;
    const value = parseDecimal(m[1]!);
    if (!Number.isFinite(value) || value <= 0) continue;
    const factor = m[2]!.startsWith("k") ? 1000 : 1;
    return { packG: value * factor, rest: s.replace(m[0], " ") };
  }
  return { packG: null, rest: s };
}

// ─────────── 2. Calibre ───────────
//
// Cascada de patrones, del más específico al más ambiguo. El primero que
// acierta gana y se devuelve el rótulo NORMALIZADO en su forma de origen.

// Fracciones de cocina: "medio pollo", "un cuarto de ternera". No son calibres.
const COOKING_FRACTIONS = new Set(["1/2", "1/4", "3/4", "1/3", "2/3", "1/8"]);

type CalibreRule = { re: RegExp; label: (m: RegExpMatchArray) => string | null };

const CALIBRE_RULES: readonly CalibreRule[] = [
  // "U/8", "U 8" — marisco "under N piezas por kilo".
  { re: /\bu\s*\/\s*(\d+(?:[.,]\d+)?)\b/, label: (m) => `u/${m[1]}` },

  // "cal. 3", "calibro 3", "tg. 2", "tg 2", "n. 3", "nr 3".
  {
    re: /\b(?:cal|calibro|calibre|tg|taglia|n|nr|num)\.?\s*(\d{1,2})\b/,
    label: (m) => `cal.${m[1]}`,
  },

  // Grados ordinales pegados: "3ra", "1a", "2da", "3°".
  // El sufijo va SIN espacio a propósito: permitirlo haría que el rango
  // "2 a 4 kg" se leyera como grado 2.
  {
    re: /\b([123])(?:ra|da|era|a|°|º)\b/,
    label: (m) => `cal.${m[1]}`,
  },
  {
    re: /\b(prima|seconda|terza|primera|segunda|tercera)\b/,
    label: (m) => {
      const grade: Record<string, string> = {
        prima: "1", primera: "1",
        seconda: "2", segunda: "2",
        terza: "3", tercera: "3",
      };
      const g = grade[m[1]!];
      return g ? `cal.${g}` : null;
    },
  },

  // Rango de peso por pieza con unidad: "2-4 kg", "400/500 g", "300-400 gr".
  {
    re: /\b(\d+(?:[.,]\d+)?)\s*[/-]\s*(\d+(?:[.,]\d+)?)\s*(kg|gr|g|grammi)\b/,
    label: (m) => {
      const a = parseDecimal(m[1]!);
      const b = parseDecimal(m[2]!);
      if (!(a > 0) || !(b > a)) return null;
      const unit = m[3]!.startsWith("k") ? "kg" : "g";
      return `${m[1]!.replace(".", ",")}-${m[2]!.replace(".", ",")} ${unit}`;
    },
  },

  // Rango de piezas por kilo sin unidad: "15/20", "20/30", "8/12".
  // Se exige b > a (un calibre es un rango ascendente) — eso solo ya descarta
  // las fechas ("15/07"). Las fracciones de cocina sí pasarían ese filtro
  // ("Pollo 1/2", "1/4 di vitello"), así que van en lista negra explícita:
  // son pocas y conocidas, y adivinarlas por magnitud descartaría calibres
  // reales de marisco grande como "2/4".
  {
    re: /\b(\d{1,3})\s*\/\s*(\d{1,3})\b/,
    label: (m) => {
      const a = Number(m[1]);
      const b = Number(m[2]);
      if (!(a > 0) || !(b > a)) return null;
      if (COOKING_FRACTIONS.has(`${a}/${b}`)) return null;
      return `${a}/${b}`;
    },
  },
];

function extractCalibre(s: string): { calibreLabel: string | null; rest: string } {
  for (const rule of CALIBRE_RULES) {
    const m = s.match(rule.re);
    if (!m) continue;
    const label = rule.label(m);
    if (!label) continue;
    return { calibreLabel: label, rest: s.replace(m[0], " ") };
  }
  return { calibreLabel: null, rest: s };
}

// ─────────── 3. Procedencia ───────────
//
// Las variantes se prueban de la más larga a la más corta para que
// "mazara del vallo" gane sobre "mazara" y no quede "del vallo" colgando.

const PROCEDENCIA_VARIANTS: ReadonlyArray<{ canonical: string; variant: string }> =
  Object.entries(PROCEDENCIAS)
    .flatMap(([canonical, variants]) =>
      variants.map((variant) => ({ canonical, variant })),
    )
    .sort((a, b) => b.variant.length - a.variant.length);

// Las variantes de una palabra sola se comparan POR RAÍZ, no literalmente:
// enumerar cada flexión ("galiziano/galiziana/galiziani/galiziane") es una
// pelea perdida. La raíz de "galiziano" es "galizian", y todas las flexiones
// caen ahí.
//
// Solo desde 5 letras: por debajo la raíz es demasiado corta y arrastra
// palabras que no tienen nada que ver ("peru" → "per", que capturaría "pera").
const STEM_MATCH_MIN_LEN = 5;

function matchVariant(
  tokens: readonly string[],
  variant: string,
): string | null {
  if (tokens.includes(variant)) return variant;
  if (variant.length < STEM_MATCH_MIN_LEN) return null;
  const target = stem(variant);
  return tokens.find((t) => stem(t) === target) ?? null;
}

function extractOrigen(s: string): { origen: string | null; rest: string } {
  let rest = s;
  let origen: string | null = null;
  const tokens = s.split(/[^a-z0-9àèéìòù]+/).filter(Boolean);

  for (const { canonical, variant } of PROCEDENCIA_VARIANTS) {
    // Las variantes de varias palabras ("mazara del vallo") se buscan
    // literales sobre la frase; las de una sola, por raíz sobre los tokens.
    if (variant.includes(" ")) {
      const re = wordRe(variant);
      if (!re.test(rest)) continue;
      origen = canonical;
      rest = rest.replace(re, " ");
      break;
    }
    const hit = matchVariant(tokens, variant);
    if (!hit) continue;
    origen = canonical;
    rest = rest.replace(wordRe(hit), " ");
    break;
  }

  // La denominación se anexa a la procedencia si hay ("parma dop"), o vale
  // por sí sola si el proveedor no nombró el lugar ("prosciutto dop").
  for (const den of DENOMINACIONES) {
    const re = wordRe(den);
    if (!re.test(rest)) continue;
    origen = origen ? `${origen} ${den}` : den;
    rest = rest.replace(re, " ");
    break;
  }

  return { origen, rest };
}

// ─────────── 4. Conservación ───────────

function extractConservacion(s: string): {
  conservacion: Conservacion | null;
  rest: string;
} {
  // Descongelado primero. No hace falta por solapamiento de texto (el match
  // es con límites de palabra, así que "congelato" no pica dentro de
  // "decongelato"), sino porque si una descripción nombrara las dos cosas
  // manda la más restrictiva.
  for (const key of ["descongelado", "congelado", "fresco"] as const) {
    for (const word of CONSERVACION_WORDS[key]) {
      const re = wordRe(word);
      if (!re.test(s)) continue;
      return { conservacion: key, rest: s.replace(re, " ") };
    }
  }
  return { conservacion: null, rest: s };
}

// ─────────── 5. baseName y baseKey ───────────
//
// NO se intenta singularizar. En italiano el plural -i puede venir de -o
// (gambero → gamberi) o de -e (pesce → pesci): desde el plural no hay forma
// de saber cuál era, y cualquier regla fija inventa palabras y —peor— manda
// el singular y el plural de la MISMA palabra a claves distintas
// ("pesce"→"pesca" pero "pesci"→"pesco").
//
// En vez de adivinar el singular, se corta la vocal final: es una raíz
// estable que no pretende ser una palabra real, solo agrupar.
//
//   gambero / gamberi  → gamber
//   pesce   / pesci    → pesc
//   cozza   / cozze    → cozz
//   gamba   / gambas   → gamb
//
// Sobre-agrupa en algún caso raro (pasta/pasto → past), pero solo afecta a
// qué productos se muestran juntos y a qué se le propone al chef, que
// siempre confirma.

function stem(token: string): string {
  let t = token;
  // Plural castellano primero: "gambas" → "gamba", "tomates" → "tomate".
  if (t.endsWith("es") && t.length > 4) t = t.slice(0, -2);
  else if (t.endsWith("s") && t.length > 3) t = t.slice(0, -1);
  // Vocal final (italiano/castellano). Se conserva un mínimo de 3 letras
  // para no dejar raíces inservibles ("uva" → "uva", no "uv").
  if (t.length > 3 && /[aeiou]$/.test(t)) t = t.slice(0, -1);
  return t;
}

function meaningfulTokens(s: string): string[] {
  const tokens: string[] = [];
  for (const raw of s.split(/[^a-z0-9àèéìòù]+/)) {
    if (!raw) continue;
    // Números sueltos y códigos alfanuméricos del proveedor: fuera.
    if (/^\d+$/.test(raw)) continue;
    if (/\d/.test(raw) && /[a-z]/.test(raw)) continue;
    if (raw.length < 2) continue;
    if (NOISE_WORDS.has(raw)) continue;
    tokens.push(raw);
  }
  return tokens;
}

export function toBaseKey(baseName: string): string {
  return meaningfulTokens(baseName).map(stem).join(" ");
}

// ─────────── API ───────────

export function splitAttributes(desc: string): ProductAttributes {
  // Los puntos pegados de las abreviaturas ("GAMB.ROSSO") se abren a espacio
  // antes de normalizar, si no el token queda "gambrosso".
  const normalized = normalizeForMatch(desc.replace(/\.(?=[a-zA-Z])/g, ". "));

  const pack = extractPack(normalized);
  const calibre = extractCalibre(pack.rest);
  const origen = extractOrigen(calibre.rest);
  const conservacion = extractConservacion(origen.rest);

  const baseName = meaningfulTokens(conservacion.rest).join(" ");

  return {
    baseName,
    baseKey: toBaseKey(baseName),
    origen: origen.origen,
    calibreLabel: calibre.calibreLabel,
    conservacion: conservacion.conservacion,
    packG: pack.packG,
  };
}

// ¿Dos nombres de familia hablan del mismo producto?
//
// Compara por raíces (baseKey) y tolera ABREVIATURAS, que es como escriben
// medio los proveedores: "GAMB.ROSSO" vs "Gambero rosso". Un token cuenta
// como pareja de otro si son iguales o si uno es prefijo del otro con al
// menos 3 letras — "gamb" es prefijo de "gamber".
//
// Se exige MISMA cantidad de tokens significativos y que todos emparejen.
// Es deliberadamente estricto: "gambero" solo no reclama a "gambero rosso"
// (le falta el color, que sí distingue producto), y "gambero rosso crudo"
// tampoco. Cuando no empareja, el renglón cae como producto nuevo y decide
// el chef — que es el desenlace seguro. Fusionar de más es el error caro.
export function baseNameMatches(a: string, b: string): boolean {
  const at = toBaseKey(a).split(" ").filter(Boolean);
  const bt = toBaseKey(b).split(" ").filter(Boolean);
  if (at.length === 0 || bt.length === 0) return false;

  const [small, large] = at.length <= bt.length ? [at, bt] : [bt, at];
  if (small.length < large.length) return false;

  const pairs = (x: string, y: string) =>
    x === y ||
    (x.length >= 3 && y.startsWith(x)) ||
    (y.length >= 3 && x.startsWith(y));

  return small.every((t) => large.some((u) => pairs(t, u)));
}

// ¿Dos descripciones hablan del MISMO artículo, o de dos hermanos del mismo
// grupo? Compara solo los atributos discriminantes (no el packG: el mismo
// artículo se vende en cajas de distinto tamaño).
//
// null en un lado se trata como "no informado" y NO invalida el match: un
// proveedor que escribe "gambero rosso 15/20" sin decir la procedencia sigue
// pudiendo ser el "Gambero rosso Sicilia 15/20" del banco. Solo un choque de
// dos valores PRESENTES y distintos separa los productos.
export function attributesMatch(
  a: Pick<ProductAttributes, "origen" | "calibreLabel" | "conservacion">,
  b: Pick<ProductAttributes, "origen" | "calibreLabel" | "conservacion">,
): boolean {
  const clash = (x: string | null, y: string | null) =>
    x !== null && y !== null && x !== y;
  return (
    !clash(a.origen, b.origen) &&
    !clash(a.calibreLabel, b.calibreLabel) &&
    !clash(a.conservacion, b.conservacion)
  );
}

// ¿Los atributos del query alcanzan para señalar UN producto concreto?
// Se usa en la desambiguación de recetas: si la línea no trae ningún
// atributo, no hay forma de elegir entre los hermanos del grupo y hay que
// preguntarle al chef.
export function hasDiscriminators(
  a: Pick<ProductAttributes, "origen" | "calibreLabel" | "conservacion">,
): boolean {
  return a.origen !== null || a.calibreLabel !== null || a.conservacion !== null;
}
