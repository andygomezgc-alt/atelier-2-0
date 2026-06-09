// Tablas hardcoded para defaults del Banco de Productos:
//
// 1. defaultMermaPct(category): merma sugerida por categoría. Es el punto de
//    partida cuando se crea un producto sin que el chef la setee. El chef
//    puede editarla; si lo hace, mermaOrigen pasa a "confirmada".
//
// 2. CRITICALITY_EXCEPTION_PATTERNS: productos que entran SIEMPRE en
//    criticidad "alta" sin esperar al cálculo económico semanal (Fase 6).
//    Match por nombre normalizado (lowercase, sin acentos) usando substring.
//
// Estas tablas viven en código por simplicidad. Si más adelante el chef quiere
// editarlas desde la UI, las movemos a una tabla en DB.

import type { ProductCategory } from "@atelier/shared";

// Mermas por defecto por categoría — el chef las ajusta al crear el producto.
// Pensados como punto de partida razonable: pescado medio, hierba fresca, etc.
// Para pezzaturas específicas (pescado grande, carne sin hueso), el chef las
// edita arriba del default.
export function defaultMermaPct(category: ProductCategory): number {
  switch (category) {
    case "pescado":
      return 50; // pescado entero medio (branzino, orata)
    case "carne":
      return 20; // promedio entre con/sin hueso
    case "verdura":
      return 17; // promedio hojas/raíz
    case "fruta":
      return 15;
    case "lacteo":
      return 5;
    case "panaderia":
      return 3;
    case "seco":
      return 0;
    case "especia":
      return 0;
    case "hierba":
      return 25; // hierbas frescas (si son secas el chef lo baja a 0)
    case "vinagre_aceite":
      return 0;
    case "otro":
      return 10;
  }
}

// Patrones que disparan criticidad "alta" automática. Se matchea por substring
// del nombre normalizado (sin acentos, lowercase). Mantener corto y específico:
// los falsos positivos llevan a marcar productos triviales como críticos.
//
// Si el chef discrepa con el match automático, edita criticality manualmente
// y queda con criticalityManual=true (no lo pisamos).
export const CRITICALITY_EXCEPTION_PATTERNS: ReadonlyArray<string> = [
  // trufas (cualquier variedad)
  "trufa",
  "tartufo",
  "truffe",
  // caviar
  "caviar",
  // foie gras
  "foie gras",
  // oro comestible
  "oro comestible",
  "gold leaf",
  "foglia oro",
  // azafrán
  "azafran",
  "zafferano",
  "saffron",
  // vainilla en rama (no esencia)
  "vainilla en rama",
  "baccello di vaniglia",
  "vanilla bean",
  // jamón ibérico de bellota
  "iberico de bellota",
  "iberico bellota",
  "pata negra",
  // parmigiano reggiano reserva (24+ meses)
  "parmigiano reggiano riserva",
  "parmigiano riserva",
  // hongos especiales secos / raros
  "porcini",
  "morilla",
  "morchella",
  "chanterelle",
  "finferli",
  // aceites de trufa
  "aceite de trufa",
  "olio tartufo",
  "truffle oil",
  // vinagres añejos (balsámico tradicional 25+ años)
  "balsamico tradicionale",
  "aceto balsamico tradizionale",
  "balsamic tradizionale",
  // carnes ultra-premium (no son meramente "alta calidad", son productos
  // marca que duplican el costo de la receta)
  "wagyu",
  "kobe",
  // mariscos premium específicos (los "comunes" — ostras, langostinos —
  // no entran acá; entran a "alta" por categoría=pescado)
  "uni",
  "erizo de mar",
  "ricci di mare",
  // huevas curadas
  "bottarga",
  "botarga",
  // camarones rojos italianos premium
  "gambero rosso",
  "gamberi rossi",
];

// Normaliza un nombre para matching (lowercase + sin acentos + colapsar
// espacios). Movida a @atelier/shared en Entrega A.5 para que mobile también
// pueda validar input client-side antes de mandar al backend. Re-importada
// acá (y re-exportada para no romper imports externos en purchase-unit,
// criticality, etc.).
import { normalizeForMatch } from "@atelier/shared";
export { normalizeForMatch };

// ───────── Categorización por keywords ─────────
//
// Tabla de keywords por categoría usada por `categorizeFromName(name)`
// durante la migración para darle una categoría sensata a los drafts.
//
// Reglas:
//   - Match por WORD-BOUNDARY: `\bpan\b` matchea "pan" o "pan rallado" pero
//     NO "pantelleria" ni "pancake". Para keywords con espacio (multi-word)
//     usamos substring directo porque \b alrededor de espacio no aplica.
//   - Primer match gana. El orden importa: vinagre_aceite va antes de
//     fruta/verdura para que "aceite de semilla de uva" gane vinagre y no
//     fruta (por "uva" interno).
//   - Castellano / italiano / inglés mezclados — los chefs no normalizan.
//   - Si nada matchea → "otro" (decisión del caller).
//
// Mantener compacta: keywords muy genéricas (ej. "fresco") generan falsos
// positivos. Apunto a 10-25 keywords por categoría que cubran ~80% del
// vocabulario habitual del chef en restaurante italo-argentino.
const CATEGORY_KEYWORDS: ReadonlyArray<{
  category: ProductCategory;
  keywords: ReadonlyArray<string>;
}> = [
  {
    category: "pescado",
    keywords: [
      "atun", "tonno", "tuna",
      "merluza", "merluzzo", "hake",
      "salmon", "salmone",
      "pulpo", "polpo", "octopus",
      "calamar", "calamari", "squid",
      "camaron", "camarones", "gamba", "gambas", "gambero", "gamberi", "shrimp",
      "langostino", "scampi", "prawn",
      "mejillon", "cozza", "cozze", "vongola", "vongole", "almeja", "clam",
      "bacalao", "baccala", "stoccafisso", "cod",
      "lubina", "branzino", "robalo", "seabass",
      "dorada", "orata", "seabream",
      "rodaballo", "rombo", "turbot",
      "pez espada", "pesce spada", "swordfish",
      "caballa", "sgombro", "mackerel",
      "sardina", "sardine",
      "anchoa", "anchoas", "acciuga", "acciughe", "alici", "anchovy",
      "lenguado", "sogliola", "sole",
      "trucha", "trota", "trout",
      "ricciola", "seriola", "amberjack",
      "bonito", "palamita",
      "aragosta", "astice", "lobster", "bogavante",
      "pescado", "pesce", "fish",
      "mariscos", "frutti di mare", "seafood",
      "ostra", "ostion", "ostriche", "oyster",
      "vieira", "capesante", "scallop",
      "bottarga", "botarga",
      "caviar", "caviale",
    ],
  },
  {
    category: "carne",
    keywords: [
      "pollo", "chicken", "pechuga", "petto di pollo", "muslo",
      "pavo", "tacchino", "turkey",
      "pato", "anatra", "duck", "magret",
      "cerdo", "maiale", "pork", "panceta", "pancetta", "bacon",
      "ternera", "vitello", "veal",
      "vaca", "manzo", "beef", "carne", "res", "buey", "bue",
      "cordero", "agnello", "lamb", "capretto", "kid",
      "conejo", "coniglio", "rabbit",
      "jabali", "cinghiale", "boar", "wild boar",
      "jamon", "prosciutto", "ham",
      "salchicha", "salsiccia", "sausage", "chorizo",
      "bistec", "bistecca", "steak",
      "costilla", "costoletta", "rib", "chuleta",
      "solomillo", "filetto", "tenderloin",
      "lomo", "lombo", "loin",
      "bondiola", "entrana",
      "higado", "fegato", "liver",
      "ossobuco",
      "wagyu", "kobe",
      // Aves de caza / carnes finas de autor — comportamiento de compra
      // es "por pieza con peso variable" así que el cálculo por kg refleja
      // mejor el costo real que por unidad.
      "pichon", "piccione", "pigeon",
      "codorniz", "quaglia", "quail",
      "faraona", "guinea fowl", "guinea-fowl",
      "fagiano", "pheasant",
      // Caza mayor
      "lepre", "hare",
      "capriolo", "roe deer", "roe-deer",
      "cervo", "venado", "deer", "venison",
      "ciervo",
    ],
  },
  {
    category: "lacteo",
    keywords: [
      "leche", "latte", "milk",
      "queso", "formaggio", "cheese",
      "yogur", "yogurt",
      "crema", "panna", "pannacotta", "nata", "cream",
      "manteca", "mantequilla", "burro", "butter",
      "mozzarella", "fior di latte",
      "parmesano", "parmigiano", "parmesan", "grana padano",
      "pecorino", "ricotta", "mascarpone", "stracciatella", "stracchino",
      "gorgonzola", "fontina", "asiago", "taleggio",
      "gruyere", "emmental", "cheddar", "brie", "camembert", "feta",
      "burrata",
    ],
  },
  {
    category: "panaderia",
    keywords: [
      "pan", "pane", "bread",
      "focaccia", "ciabatta", "baguette", "brioche", "croissant",
      "pretzel", "bagel", "pita", "naan",
      "masa", "pasta brisee", "pasta sfoglia", "puff pastry", "filo", "phyllo",
      "panettone", "pandoro",
      "pangrattato", "breadcrumb", "migas de pan",
      "grissini",
      "tortilla de trigo",
    ],
  },
  {
    // ¡Orden importa! vinagre_aceite ANTES de fruta/verdura para que
    // "aceite de semilla de uva" gane vinagre_aceite y no fruta (por "uva").
    category: "vinagre_aceite",
    keywords: [
      "aceite", "olio", "oil",
      "vinagre", "aceto", "vinegar", "balsamico", "balsamic",
    ],
  },
  {
    category: "fruta",
    keywords: [
      "manzana", "mela", "apple",
      "pera", "pear",
      "naranja", "arancia", "orange",
      "limon", "limone", "lemon",
      "mandarina", "mandarino", "mandarin",
      "pomelo", "pompelmo", "grapefruit",
      "lima", "lime",
      "fresa", "frutilla", "fragola", "strawberry",
      "frambuesa", "lampone", "raspberry",
      "mora", "blackberry",
      "arandano", "mirtillo", "blueberry",
      "uva", "grape",
      "banana", "platano", "banano",
      "ananas", "anana", "pineapple",
      "mango", "papaya", "kiwi", "maracuya",
      "durazno", "melocoton", "pesca", "peach",
      "damasco", "albaricoque", "albicocca", "apricot",
      "ciruela", "prugna", "plum",
      "cereza", "ciliegia", "cherry",
      "melon", "melone",
      "sandia", "anguria", "watermelon",
      "higo", "fico", "fig",
      "granada", "melograno", "pomegranate",
      "bergamotto", "bergamota", "cedro", "kumquat",
    ],
  },
  {
    category: "verdura",
    keywords: [
      "tomate", "pomodoro", "pomodori", "pomodorini", "tomato",
      "cebolla", "cipolla", "cipolle", "onion",
      "ajo", "aglio", "garlic",
      "zanahoria", "carota", "carote", "carrot",
      "apio", "sedano", "celery",
      "papa", "papas", "patata", "patate", "potato",
      "batata", "boniato", "sweet potato",
      "calabaza", "zapallo", "zucca", "pumpkin",
      "zucchini", "zucchina", "zucchine", "zapallito", "courgette",
      "berenjena", "melanzana", "melanzane", "eggplant",
      "pimiento", "morron", "peperone", "peperoni", "pepper",
      "chile", "peperoncino", "guindilla",
      "lechuga", "lattuga", "lettuce",
      "espinaca", "spinaci", "spinach",
      "acelga", "bietola", "chard",
      "rucula", "rucola", "arugula",
      "radicchio",
      "endibia", "endivia", "endive", "escarola", "scarola",
      "repollo", "cavolo", "cabbage",
      "coliflor", "cavolfiore", "cauliflower",
      "brocoli", "broccoli",
      "alcaucil", "alcachofa", "carciofo", "carciofi", "artichoke",
      "esparrago", "asparago", "asparagi", "asparagus",
      "puerro", "porro", "leek",
      "chalota", "scalogno", "shallot",
      "hinojo", "finocchio", "fennel",
      "pepino", "cetriolo", "cucumber",
      "remolacha", "barbabietola", "beet",
      "nabo", "rapa", "turnip",
      "rabano", "ravanello", "radish",
      "maiz", "mais", "choclo", "corn",
      "arveja", "guisante", "pisello", "pea",
      "judia verde", "chaucha", "fagiolino", "green bean",
      "haba", "fava",
      "champignon", "champinon", "funghi", "fungo", "mushroom",
      "portobello",
      "alcaparra", "alcaparras", "cappero", "capperi", "caper",
    ],
  },
  {
    category: "hierba",
    keywords: [
      "albahaca", "basilico", "basil",
      "perejil", "prezzemolo", "parsley",
      "cilantro", "coriandolo",
      "cebollin", "cebollino", "ciboulette", "erba cipollina", "chive",
      "menta", "mint",
      "romero", "rosmarino", "rosemary",
      "tomillo", "timo", "thyme",
      "oregano", "origano",
      "salvia", "sage",
      "eneldo", "aneto", "dill",
      "mejorana", "maggiorana", "marjoram",
      "estragon", "dragoncello", "tarragon",
    ],
  },
  {
    category: "especia",
    keywords: [
      "comino", "cumino", "cumin",
      "pimienta", "pepe", "pepper",
      "pimenton", "paprika",
      "nuez moscada", "noce moscata", "nutmeg",
      "canela", "cannella", "cinnamon",
      "clavo", "chiodi di garofano", "clove",
      "cardamomo", "cardamom",
      "curcuma", "turmeric",
      "jengibre", "zenzero", "ginger",
      "curry", "garam masala",
      "anis", "anice", "anise",
      "mostaza en grano", "senape in grani", "mustard seed",
      "enebro", "ginepro", "juniper",
      "laurel", "alloro", "bay leaf",
      "azafran", "zafferano", "saffron",
    ],
  },
  {
    category: "seco",
    keywords: [
      "arroz", "riso", "rice",
      "pasta", "fideo", "spaghetti", "penne", "rigatoni", "linguine",
      "fettuccine", "tagliatelle", "lasagna", "ravioli", "tortellini",
      "gnocchi", "noqui",
      "harina", "farina", "flour", "semola", "semolina",
      "avena", "oat",
      "quinoa", "quinua",
      "couscous", "cous cous", "bulgur",
      "polenta",
      "almidon", "amido", "starch", "fecula", "maicena",
      "gelatina",
      "azucar", "zucchero", "sugar",
      "miel", "miele", "honey",
      "sal", "sale", "salt",
      "bicarbonato",
      "levadura", "lievito", "yeast",
      "polvo de hornear", "baking powder",
      "chocolate", "cioccolato",
      "cacao", "cocoa",
      "lenteja", "lenticchia", "lentil",
      "garbanzo", "cece", "chickpea",
      "frijol", "fagiolo", "poroto", "bean",
      "almendra", "mandorla", "mandorle", "almond",
      "nuez", "noce", "walnut",
      "avellana", "nocciola", "hazelnut",
      "pistacho", "pistacchio", "pistachio",
      "anacardo", "cashew",
      "castana", "castagna", "chestnut",
      "pinon", "pinolo", "pinenut", "pine nut",
      "sesamo", "sesame", "ajonjoli",
      "chia",
      "pasa", "uvetta", "raisin",
      "datil", "dattero", "date",
      // Café — el chef lo compra en kg (paquete de 250g/500g/1kg), no
      // por unidad.
      "cafe", "caffe", "coffee",
      // Algas secas (kombu, nori, wakame, hijiki, dulse): se compran en
      // paquetes pequeños, se usan como condimento. Conservan larga, no
      // son productos críticos de alto coste — comportamiento "seco".
      // "dulce" como keyword es peligroso (matchea "patata dulce", "pimentón
      // dulce"); lo dejo fuera. "dulse" sí (alga específica).
      "alga", "algas", "kombu", "nori", "wakame", "hijiki", "dulse",
    ],
  },
];

// Escape de regex metachars para construir el patron word-boundary de forma
// segura. Mantengo conservador — no aceptamos paréntesis/punto/etc en las
// keywords (no los necesitamos).
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Cache de regex compilados — la tabla CATEGORY_KEYWORDS es constante y
// el script de migración llama categorize potencialmente cientos de veces.
const SINGLE_WORD_CACHE = new Map<string, RegExp>();
function singleWordRegex(kw: string): RegExp {
  const cached = SINGLE_WORD_CACHE.get(kw);
  if (cached) return cached;
  const re = new RegExp(`\\b${escapeRegex(kw)}\\b`);
  SINGLE_WORD_CACHE.set(kw, re);
  return re;
}

function matchesKeyword(haystack: string, keyword: string): boolean {
  if (keyword.includes(" ")) {
    // Multi-palabra: substring directo. `\b` alrededor de espacio no aplica
    // y los multi-word ya son lo bastante específicos como para no necesitar
    // boundary (ej. "pasta brisee" no aparece como prefijo accidental).
    return haystack.includes(keyword);
  }
  return singleWordRegex(keyword).test(haystack);
}

// Devuelve la categoría sugerida para un nombre de producto inferida por
// keywords. Si nada matchea, "otro".
export function categorizeFromName(name: string): ProductCategory {
  const normalized = normalizeForMatch(name);
  if (!normalized) return "otro";
  for (const group of CATEGORY_KEYWORDS) {
    for (const kw of group.keywords) {
      if (matchesKeyword(normalized, kw)) return group.category;
    }
  }
  return "otro";
}
