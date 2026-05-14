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
  MatchProductsRequest,
  MatchProductsResponse,
  MatchResult,
  CreateYieldTestRequest,
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

// Matching de ingredientes contra el banco (Fase 2). Una sola request con
// el array completo de queries; el server devuelve un MatchResult por cada
// uno en el mismo orden. Sin caché — el set de productos puede cambiar
// entre creación de receta y creación de producto draft.
export type { MatchResult };
export async function matchProducts(queries: string[]): Promise<MatchResult[]> {
  if (queries.length === 0) return [];
  const body: MatchProductsRequest = { queries };
  const res = await apiFetch<MatchProductsResponse>("/api/products/match", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return res.results;
}

// Migración de recetas existentes (Fase 5). Solo admin.
export type MigrateRecipesReport = {
  mode: "dry-run" | "apply";
  applied: boolean;
  summary: {
    totalRecipes: number;
    recipesToMigrate: number;
    recipesSkipped: number;
    totalIngredients: number;
    matches: { exact: number; probable: number; none: number };
    probableMatchesPolicy: "auto-link" | "leave-unmatched";
  };
  conflicts: Array<{
    recipeId: string;
    recipeTitle: string;
    ingredientIdx: number;
    rawText: string;
    productId: string;
    productName: string;
    distance: number;
  }>;
  newDrafts: Array<{
    recipeId: string;
    recipeTitle: string;
    ingredientIdx: number;
    rawText: string;
  }>;
  result?: {
    recipesMigrated: number;
    draftsCreated: number;
    errors: Array<{ recipeId: string; error: string }>;
  };
};

// Yield test (Fase 6): crear una prueba de rendimiento. El server calcula
// la merma medida y la persiste tanto en la tabla YieldTest como en el
// producto (Product.mermaPct + Product.mermaOrigen='medida').
export type YieldTestResponse = {
  product: ProductFull;
  yieldTest: {
    id: string;
    pesoBrutoG: number;
    pesoUtilG: number;
    mermaCalculadaPct: number;
    notas: string | null;
    createdAt: string;
  };
};

export async function createYieldTest(
  productId: string,
  data: CreateYieldTestRequest,
): Promise<YieldTestResponse> {
  const result = await apiFetch<YieldTestResponse>(
    `/api/products/${productId}/yield-tests`,
    { method: "POST", body: JSON.stringify(data) },
  );
  // El test cambia merma + agrega fila al historial → invalidar caches del
  // producto y de la lista (la criticidad/realCost pueden cambiar al
  // mostrarse en otras vistas).
  setCached(`products:detail:${productId}`, result.product);
  invalidate("products:list");
  invalidate(`products:history:${productId}`);
  return result;
}

// Recalc semanal de criticidad por peso económico (Fase 6). Solo admin.
export type RecalcCriticalityReport = {
  applied: boolean;
  summary: {
    totalProducts: number;
    skippedManual: number;
    changes: number;
    timestamp: string;
  };
  changes: Array<{
    productId: string;
    productName: string;
    from: Criticality;
    to: Criticality;
    reason: "economic" | "default";
    maxShare: number;
  }>;
};

export async function recalcCriticality(
  dryRun = false,
): Promise<RecalcCriticalityReport> {
  const result = await apiFetch<RecalcCriticalityReport>(
    "/api/products/recalc-criticality",
    {
      method: "POST",
      body: JSON.stringify({ dryRun }),
    },
  );
  if (!dryRun && result.changes.length > 0) {
    invalidate("products:");
  }
  return result;
}

export async function migrateLegacyRecipes(
  mode: "dry-run" | "apply",
  options: {
    probableMatches?: "auto-link" | "leave-unmatched";
    force?: boolean;
  } = {},
): Promise<MigrateRecipesReport> {
  const report = await apiFetch<MigrateRecipesReport>(
    "/api/products/migrate-recipes",
    {
      method: "POST",
      body: JSON.stringify({
        mode,
        probableMatches: options.probableMatches ?? "leave-unmatched",
        force: options.force ?? false,
      }),
    },
  );
  // El apply muta el banco → invalidamos caches.
  if (mode === "apply") {
    invalidate("products:");
  }
  return report;
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
