// Projections para el Banco de Productos.
//
// Costo real (realCost) se calcula en read-time como:
//   precioCompra / (1 - mermaPct/100)
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
  | "criticality"
  | "estado"
  | "precioActualizadoAt"
> & Partial<Pick<Product, "allergen" | "allergens" | "allergensReviewed">>;

export function projectProductListItem(
  p: ProductListSource,
  usedByUnitCount = 0,
): ProductListItem {
  const mermaPctNum = Number(p.mermaPct);
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
    realCost: realCost(p.precioCompra, mermaPctNum),
    mermaPct: mermaPctNum,
    mermaOrigen: p.mermaOrigen,
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
    aliases: p.aliases,
    criticalityManual: p.criticalityManual,
    recipesUsingCount,
    recipesUsingByUnitCount,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}
