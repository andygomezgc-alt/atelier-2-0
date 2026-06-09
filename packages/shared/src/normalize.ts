// Normalización compartida API + Mobile.
//
// `normalizeForMatch` se usa en:
//  - apps/api: keyword matching de categorizer/purchase-unit/criticality
//    (todos en lib/products/) y matching fuzzy de Fase 2.
//  - packages/shared: parser de pezzatura (Entrega A.5).
//
// Vive en shared porque mobile también necesita aplicar la misma normalización
// para validar input client-side antes de mandar al backend (PezzaturaField
// usa parsePezzatura, que usa normalizeForMatch).

export function normalizeForMatch(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // sin diacríticos (combining marks)
    .replace(/\s+/g, " ")
    .trim();
}
