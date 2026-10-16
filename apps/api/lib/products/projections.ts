// Projections para el Banco de Productos.
//
// Costo real (realCost) se calcula en read-time como:
//   precioCompra × (1 + taxRatePct/100) / (1 - mermaPct/100)
// Un rendimiento útil cero devuelve null, también para datos antiguos.
//
// Precios se manejan en centavos enteros (mismo patrón que MenuItem.price).
// merma se guarda como Decimal(5,2) en Postgres; Prisma lo trae como
// `Prisma.Decimal`, lo convertimos a number para la projection.

import type { Product } from "@atelier/db";
import type { ProductDetail, ProductListItem } from "@atelier/shared";
import { realCost } from "./cost";

// Subconjunto de campos que projectProductListItem realmente lee. Permite que
// GET /api/products use un `select` mínimo en vez de traer la fila completa.
type ProductListSource = Pick<
  Product,
  | "id"
  | "name"
  | "category"
  | "pezzatura"
  | "pezzaturaMode"
  | "pezzaturaMin"
  | "pezzaturaMax"
  | "unidadCompra"
  | "precioCompra"
  | "mermaPct"
  | "mermaOrigen"
  | "gramosPorLitro"
  | "taxRatePct"
  | "criticality"
  | "estado"
  | "precioActualizadoAt"
> & Partial<Pick<Product, "allergen" | "allergens" | "allergensReviewed">>;

export function projectProductListItem(
  p: ProductListSource,
  usedByUnitCount = 0,
): ProductListItem {
  const mermaPctNum = Number(p.mermaPct);
  // `== null`: a stale query engine may omit the column (same as gramosPorLitro).
  const taxRatePctNum = p.taxRatePct == null ? 0 : Number(p.taxRatePct);
  return {
    allergens: p.allergens?.length || p.allergensReviewed ? (p.allergens ?? []) : p.allergen ? [p.allergen] : [],
    allergensReviewed: p.allergensReviewed ?? false,
    id: p.id,
    name: p.name,
    category: p.category,
    pezzatura: p.pezzatura,
    // Entrega A.5: pezzatura estructurada. Mode/Min/Max van juntos (CHECK
    // consistency en DB). Min/Max son Decimal en Prisma → convert a number.
    // `?? null` defensivo: si el query engine de runtime es viejo (Windows
    // EPERM al regenerar la .dll antes de reiniciar dev server) el campo
    // viene undefined, que JSON.stringify omite. Normalizar a null mantiene
    // shape consistente.
    pezzaturaMode: p.pezzaturaMode ?? null,
    pezzaturaMin: p.pezzaturaMin ? Number(p.pezzaturaMin) : null,
    pezzaturaMax: p.pezzaturaMax ? Number(p.pezzaturaMax) : null,
    unidadCompra: p.unidadCompra,
    precioCompra: p.precioCompra,
    // The purchase tax is part of what the product costs, as in recipe cost (cost.ts withTax).
    realCost: realCost(p.precioCompra * (1 + taxRatePctNum / 100), mermaPctNum),
    mermaPct: mermaPctNum,
    mermaOrigen: p.mermaOrigen,
    // Decimal → number; `== null` also covers a stale query engine that
    // omits the column (same reason as the pezzatura fields above).
    gramosPorLitro: p.gramosPorLitro == null ? null : Number(p.gramosPorLitro),
    taxRatePct: taxRatePctNum,
    criticality: p.criticality,
    estado: p.estado,
    precioActualizadoAt: p.precioActualizadoAt.toISOString(),
    usedByUnitCount,
  };
}

export function projectProductDetail(
  p: Product,
  recipesUsingCount = 0,
  recipesUsingByUnitCount = 0,
): ProductDetail {
  // El detail comparte el mismo concepto que la lista para usedByUnitCount.
  return {
    ...projectProductListItem(p, recipesUsingByUnitCount),
    proveedor: p.proveedor,
    notas: p.notas,
    mermaMotivo: p.mermaMotivo ?? null,
    aliases: p.aliases,
    criticalityManual: p.criticalityManual,
    recipesUsingCount,
    recipesUsingByUnitCount,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}
