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
  // Entrega A.5 Fase 8 — productos sin pezzatura usados por unidad en
  // alguna receta. Habilita el chip filtro "Pezzatura pendiente".
  pezzaturaPendiente?: boolean;
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
  if (filters.pezzaturaPendiente) qs.set("pezzatura_pendiente", "true");
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
//
// IMPORTANTE: también invalidamos `recipes:` porque editar el precio o la
// merma de un producto cambia el campo `cost` de cualquier receta que use
// ese producto. No sabemos a priori cuántas recetas se ven afectadas, así
// que invalidación global garantiza que la próxima vista de cualquier
// receta (lista o detalle) traiga datos frescos del backend. Bug Andy
// 2026-05-17: sin esta invalidación, totalCents/perPortionCents/foodCostPct
// y el contador de missing del card de costo seguían mostrando valores
// viejos hasta reiniciar la app.
function bumpProductCache(p: ProductFull): ProductFull {
  setCached(`products:detail:${p.id}`, p);
  invalidate("products:list");
  invalidate(`products:history:${p.id}`);
  invalidate("recipes:");
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
  // mostrarse en otras vistas). También recipes: porque la merma entra al
  // cálculo de cost de cada receta que usa este producto (bug Andy 2026-05-17).
  setCached(`products:detail:${productId}`, result.product);
  invalidate("products:list");
  invalidate(`products:history:${productId}`);
  invalidate("recipes:");
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

// Sub-paso 3 del rediseño: la pantalla Ajustes del banco muestra
// "Último recalc: hace X días". Este GET devuelve el timestamp del
// último run desde AuditLog. null si nunca corrió.
export type RecalcStatus = { lastRunAt: string | null };

export const getRecalcStatus = (): Promise<RecalcStatus> =>
  apiFetch<RecalcStatus>("/api/products/recalc-criticality");

// Sub-paso 5c: cuenta de recetas legacy pendientes — la usa Ajustes para
// ocultar la entrada "Migrar recetas legacy" cuando no hay nada que hacer.
export type MigrationStatus = { pendingCount: number };

export const getMigrationStatus = (): Promise<MigrationStatus> =>
  apiFetch<MigrationStatus>("/api/products/migrate-recipes");

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
  // El apply muta el banco → invalidamos caches. También recipes: porque
  // migrate crea/reemplaza RecipeIngredient rows con qty/unit, lo que
  // afecta el cost de cada receta migrada.
  if (mode === "apply") {
    invalidate("products:");
    invalidate("recipes:");
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

// Sub-paso 6 Bug B fix (Andy 2026-05-17): cuando el editor de recetas
// (nueva.tsx finalize) detecta un ingrediente sin match contra el banco,
// crea el draft con esta función — el server aplica todos los helpers
// (parseIngredient + categorizeFromName + defaultPurchaseUnit + merma +
// criticality) para que el draft quede limpio (mismo patrón que migrate.ts).
//
// Diferencia con createProduct():
//   createProduct        — el cliente manda todos los campos explícitos.
//   createProductFromRaw — el cliente solo manda rawText; el server infiere.
export const createProductFromRaw = async (rawText: string): Promise<ProductFull> => {
  const result = await apiFetch<ProductFull>("/api/products/from-raw", {
    method: "POST",
    body: JSON.stringify({ rawText }),
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
    // Borrar un producto deja sus RecipeIngredient con productId=null
    // (SetNull en server). Las recetas que lo usaban pierden ese ingrediente
    // del cálculo de cost. Invalidamos recipes: para refrescar.
    invalidate("recipes:");
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
