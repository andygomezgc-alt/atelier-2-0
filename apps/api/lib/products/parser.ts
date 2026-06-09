// Re-export del parser de ingredientes — la lógica se movió a
// `packages/shared/src/parser.ts` en Entrega A.5 para que mobile pueda
// pre-visualizar la unidad inferida (aviso anti-typo de Fase 4).
// Mantenemos este shim para no romper los imports existentes en
// migrate.ts, route handlers y scripts.
export { parseIngredient, type ParsedIngredient } from "@atelier/shared";
