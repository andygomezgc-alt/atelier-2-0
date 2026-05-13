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
];

// Normaliza un nombre para matching (mismo algoritmo que usará el matching
// fuzzy de Fase 2: lowercase + sin acentos + colapsar espacios).
export function normalizeForMatch(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // sin diacríticos (combining marks)
    .replace(/\s+/g, " ")
    .trim();
}
