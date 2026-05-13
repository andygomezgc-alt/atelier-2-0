// Projections para el Banco de Productos.
//
// Costo real (realCost) se calcula en read-time como:
//   precioCompra / (1 - mermaPct/100)
// Si mermaPct >= 100 (caso extremo / dato corrupto), devolvemos precioCompra
// como fallback en lugar de Infinity. La capa Zod + CHECK constraints en DB
// ya impiden valores fuera de rango en escritura, pero el read es defensivo.
//
// Precios se manejan en centavos enteros (mismo patrón que MenuItem.price).
// merma se guarda como Decimal(5,2) en Postgres; Prisma lo trae como
// `Prisma.Decimal`, lo convertimos a number para la projection.

import type { Product } from "@atelier/db";
import type { ProductDetail, ProductListItem } from "@atelier/shared";

// Costo real en centavos. Redondea hacia arriba para no subestimar (mejor
// pasarse de cauto en costeo que quedar corto).
function computeRealCost(precioCompraCents: number, mermaPct: number): number {
  if (mermaPct >= 100) return precioCompraCents;
  const yieldRatio = 1 - mermaPct / 100;
  return Math.ceil(precioCompraCents / yieldRatio);
}

export function projectProductListItem(p: Product): ProductListItem {
  const mermaPctNum = Number(p.mermaPct);
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    pezzatura: p.pezzatura,
    unidadCompra: p.unidadCompra,
    precioCompra: p.precioCompra,
    realCost: computeRealCost(p.precioCompra, mermaPctNum),
    mermaPct: mermaPctNum,
    mermaOrigen: p.mermaOrigen,
    criticality: p.criticality,
    estado: p.estado,
    precioActualizadoAt: p.precioActualizadoAt.toISOString(),
  };
}

export function projectProductDetail(p: Product): ProductDetail {
  return {
    ...projectProductListItem(p),
    proveedor: p.proveedor,
    notas: p.notas,
    aliases: p.aliases,
    criticalityManual: p.criticalityManual,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}
