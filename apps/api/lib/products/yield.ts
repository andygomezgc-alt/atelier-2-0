// Cálculo de merma medida desde una prueba de rendimiento.
//
// merma % = (1 - pesoUtil / pesoBruto) * 100
//
// Ej.: 800g bruto, 480g útil → (1 - 480/800)*100 = 40% de merma.
//
// Cuando una prueba se guarda, la merma medida tiene PRIORIDAD sobre la
// sugerida o confirmada del producto: actualiza Product.mermaPct y
// Product.mermaOrigen a 'medida'. Si después el chef hace OTRA prueba con
// resultado distinto, se sobrescribe — el histórico queda en YieldTest
// para que se vea la evolución.

export function computeMermaPctFromYield(pesoBrutoG: number, pesoUtilG: number): number {
  if (pesoBrutoG <= 0) return 0;
  if (pesoUtilG < 0) return 0;
  if (pesoUtilG > pesoBrutoG) return 0; // caso defensivo; el CHECK lo bloquea
  const ratio = 1 - pesoUtilG / pesoBrutoG;
  return Math.round(ratio * 10_000) / 100; // 2 decimales
}
