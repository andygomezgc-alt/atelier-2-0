// Helper de API + caché TTL para el Banco de Productos.
// Sigue el mismo patrón que recipes.ts / menus.ts post-refactor (cache.ts):
//  - Listas y detalles cacheados 30s.
//  - Búsquedas con `q` libre se saltean el caché (cada keystroke es key única).
//  - Mutaciones (create/patch/delete) invalidan el cache "products:".

import { apiFetch, TOKEN_KEY, ApiError, NetworkError } from "./client";
import { cached, invalidate, setCached } from "./cache";
import * as SecureStore from "@/src/lib/secure-storage";
import type {
  CreateProductRequest,
  PatchProductRequest,
  ProductCategory,
  ProductDetail,
  ProductListItem,
  ProductState,
  ProductUnit,
  MermaOrigin,
  Criticality,
} from "@atelier/shared";

export type Product = ProductListItem;
export type ProductFull = ProductDetail;

export type ListProductFilters = {
  category?: ProductCategory;
  criticality?: Criticality;
  estado?: ProductState;
  mermaOrigen?: MermaOrigin;
  pendientePrecio?: boolean;
  q?: string;
};

export type PriceHistoryEntry = {
  id: string;
  precio: number;
  unidadCompra: ProductUnit;
  createdAt: string;
  author: { id: string; name: string } | null;
};

export type YieldTestEntry = {
  id: string;
  pesoBrutoG: number;
  pesoUtilG: number;
  mermaCalculadaPct: number;
  notas: string | null;
  createdAt: string;
  author: { id: string; name: string } | null;
};

export type ProductHistoryResponse = {
  priceHistory: PriceHistoryEntry[];
  yieldTests: YieldTestEntry[];
};

const PRODUCTS_TTL_MS = 30_000;

function buildQuery(filters: ListProductFilters): string {
  const qs = new URLSearchParams();
  if (filters.category) qs.set("category", filters.category);
  if (filters.criticality) qs.set("criticality", filters.criticality);
  if (filters.estado) qs.set("estado", filters.estado);
  if (filters.mermaOrigen) qs.set("mermaOrigen", filters.mermaOrigen);
  if (filters.pendientePrecio) qs.set("pendiente_precio", "true");
  if (filters.q) qs.set("q", filters.q);
  return qs.toString() ? `?${qs.toString()}` : "";
}

export function listProducts(filters: ListProductFilters = {}): Promise<Product[]> {
  const suffix = buildQuery(filters);
  // q libre: cada keystroke es key única, sin reuso real → skip cache.
  if (filters.q) {
    return apiFetch<Product[]>(`/api/products${suffix}`);
  }
  return cached(
    `products:list:${suffix}`,
    () => apiFetch<Product[]>(`/api/products${suffix}`),
    PRODUCTS_TTL_MS,
  );
}

export const getProduct = (id: string) =>
  cached(
    `products:detail:${id}`,
    () => apiFetch<ProductFull>(`/api/products/${id}`),
    PRODUCTS_TTL_MS,
  );

export const getProductHistory = (id: string) =>
  cached(
    `products:history:${id}`,
    () => apiFetch<ProductHistoryResponse>(`/api/products/${id}/history`),
    PRODUCTS_TTL_MS,
  );

// Pre-popular caché de detalle después de una mutación que devuelve el full.
function bumpProductCache(p: ProductFull): ProductFull {
  setCached(`products:detail:${p.id}`, p);
  invalidate("products:list");
  // Histórico cambia si fue update de precio — invalidar también.
  invalidate(`products:history:${p.id}`);
  return p;
}

export const createProduct = async (data: CreateProductRequest) => {
  const result = await apiFetch<ProductFull>("/api/products", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return bumpProductCache(result);
};

export const patchProduct = async (id: string, data: PatchProductRequest) => {
  const result = await apiFetch<ProductFull>(`/api/products/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return bumpProductCache(result);
};

// El backend devuelve 409 con la lista de recetas si el producto está en
// uso. apiFetch solo preserva el `error` string del body — para inspeccionar
// el array de recetas necesitamos un fetch directo.
export type DeleteProductResult =
  | { ok: true }
  | { ok: false; recipes: Array<{ id: string; title: string }> };

export async function deleteProduct(
  id: string,
  force = false,
): Promise<DeleteProductResult> {
  const base = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
  const token = await SecureStore.getItemAsync(TOKEN_KEY).catch(() => null);
  const suffix = force ? "?force=true" : "";

  let res: Response;
  try {
    res = await fetch(`${base}/api/products/${id}${suffix}`, {
      method: "DELETE",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch {
    throw new NetworkError();
  }

  if (res.ok) {
    invalidate("products:");
    return { ok: true };
  }

  if (res.status === 409) {
    const body = (await res.json().catch(() => ({}))) as {
      recipes?: Array<{ id: string; title: string }>;
    };
    return { ok: false, recipes: body.recipes ?? [] };
  }

  // Otros errores se elevan como ApiError para que el caller los maneje.
  let message = `HTTP ${res.status}`;
  try {
    const json = (await res.json()) as { error?: string };
    if (json.error) message = json.error;
  } catch {}
  throw new ApiError(res.status, message);
}
