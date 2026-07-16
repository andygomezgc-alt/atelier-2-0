// Helpers de exportación CSV. Viven en lib/ (no en el route.ts) porque Next.js
// prohíbe exports que no sean handlers/config en un archivo de ruta — exportar
// csvField desde la route rompía `next build` (aunque tsc no lo detectara).

// Cada campo se envuelve en comillas dobles y las comillas internas se duplican.
// Envolver SIEMPRE es válido y cubre `;`, `"`, saltos de línea sin casos borde.
//
// P2-2 (auditoría jul 2026): si el valor empieza por =, +, -, @, tab o CR,
// Excel/Sheets pueden interpretarlo como el inicio de una fórmula al abrir el
// CSV (CSV formula injection). Anteponemos un apóstrofo para forzarlo a texto
// literal antes de entrecomillar.
export function csvField(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}
