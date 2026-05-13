// Lógica de criticidad automática para productos.
//
// Regla 1 (excepciones): si el nombre matchea alguno de los patterns en
// CRITICALITY_EXCEPTION_PATTERNS, la criticidad es "alta" sin importar la
// categoría. Cubre productos caros que no se distinguen por categoría
// (caviar es "otro", trufa es "verdura", etc.).
//
// Regla 2 (categoría): default por familia.
//   - pescado, carne                              → alta
//   - verdura, fruta, lacteo, panaderia, seco     → media
//   - especia, hierba, vinagre_aceite, otro       → baja
//
// Regla 3 (peso económico): Fase 6 — un job semanal sube a "alta" los
// productos que pesan >15% del costo de las recetas donde aparecen. No
// pertenece a este archivo.
//
// El chef puede sobrescribir la criticidad manualmente. En ese caso
// criticalityManual=true y este recálculo no se aplica.

import type { Criticality, ProductCategory } from "@atelier/shared";
import { CRITICALITY_EXCEPTION_PATTERNS, normalizeForMatch } from "./defaults";

export function defaultCriticality(
  category: ProductCategory,
  name: string,
): Criticality {
  // Regla 1: excepciones por nombre (matchea por substring sobre el nombre
  // normalizado; los patterns también están en lowercase sin acentos).
  const normalized = normalizeForMatch(name);
  for (const pattern of CRITICALITY_EXCEPTION_PATTERNS) {
    if (normalized.includes(pattern)) return "alta";
  }

  // Regla 2: por categoría.
  switch (category) {
    case "pescado":
    case "carne":
      return "alta";
    case "verdura":
    case "fruta":
    case "lacteo":
    case "panaderia":
    case "seco":
      return "media";
    case "especia":
    case "hierba":
    case "vinagre_aceite":
    case "otro":
      return "baja";
  }
}
