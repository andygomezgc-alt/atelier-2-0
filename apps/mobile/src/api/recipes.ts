import { apiFetch, TOKEN_KEY, ApiError, NetworkError } from "./client";
import { cached, invalidate } from "./cache";
import * as SecureStore from "@/src/lib/secure-storage";
import * as FileSystem from "expo-file-system/legacy";
import type {
  RecipeListItem,
  RecipeDetail,
  CreateRecipeRequest,
  PatchRecipeRequest,
} from "@atelier/shared";

export type Recipe = RecipeListItem;
export type RecipeFull = RecipeDetail & { updatedAt: string };

export type ListFilters = {
  state?: "draft" | "in_test" | "approved";
  priority?: boolean;
  q?: string;
  trash?: boolean;
};

const RECIPES_TTL_MS = 30_000;

export function listRecipes(filters: ListFilters = {}): Promise<Recipe[]> {
  const qs = new URLSearchParams();
  if (filters.state) qs.set("state", filters.state);
  if (filters.priority) qs.set("priority", "true");
  if (filters.q) qs.set("q", filters.q);
  if (filters.trash) qs.set("trash", "true");
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  // Cuando hay búsqueda libre (q) no cacheamos: cada keystroke genera una key
  // distinta y el caché crecería sin reuso real.
  if (filters.q) {
    return apiFetch<Recipe[]>(`/api/recipes${suffix}`);
  }
  return cached(`recipes:list:${suffix}`, () => apiFetch<Recipe[]>(`/api/recipes${suffix}`), RECIPES_TTL_MS);
}

export const getRecipe = (id: string) =>
  cached(`recipes:detail:${id}`, () => apiFetch<RecipeFull>(`/api/recipes/${id}`), RECIPES_TTL_MS);

export const createRecipe = async (data: CreateRecipeRequest) => {
  const result = await apiFetch<Recipe>("/api/recipes", { method: "POST", body: JSON.stringify(data) });
  invalidate("recipes:");
  return result;
};

// Bug chips fantasma: el detalle de menú embebe título/alérgenos/ingredientes
// de cada receta que trae (para el nombre por defecto del plato y los iconos
// de alérgeno del PDF). Editar la receta deja ese embed viejo en el caché de
// menús hasta 30s.
export const patchRecipe = async (id: string, data: PatchRecipeRequest) => {
  const result = await apiFetch<RecipeFull>(`/api/recipes/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  invalidate("recipes:");
  invalidate("menus:");
  return result;
};

// Bug chips fantasma: borrar la receta deja huérfano el embed en cualquier
// menú que la tuviera — refrescamos menus: para que no siga mostrando datos
// de una receta que ya no existe.
export const deleteRecipe = async (id: string) => {
  const result = await apiFetch<{ ok: boolean }>(`/api/recipes/${id}`, { method: "DELETE" });
  invalidate("recipes:");
  invalidate("menus:");
  return result;
};

// Duplicar como borrador nuevo (no pisa la original). Devuelve la copia.
export const duplicateRecipe = async (id: string) => {
  const result = await apiFetch<RecipeFull>(`/api/recipes/${id}/duplicate`, { method: "POST" });
  invalidate("recipes:");
  return result;
};

// Restaurar desde la papelera. Devuelve la receta ya activa.
// Bug chips fantasma: la receta vuelve a existir con sus datos actuales —
// cualquier menú que la referenciaba necesita el embed fresco.
export const restoreRecipe = async (id: string) => {
  const result = await apiFetch<RecipeFull>(`/api/recipes/${id}/restore`, { method: "POST" });
  invalidate("recipes:");
  invalidate("menus:");
  return result;
};

// Escalar porciones → crea una copia (draft) con las cantidades reajustadas.
export const scaleRecipe = async (id: string, fromPortions: number, toPortions: number) => {
  const result = await apiFetch<RecipeFull>(`/api/recipes/${id}/scale`, {
    method: "POST",
    body: JSON.stringify({ fromPortions, toPortions }),
  });
  invalidate("recipes:");
  return result;
};

// Fase 3 del Banco de Productos — el server, después de extraer la receta
// del PDF/DOCX, corre matching contra el banco. La respuesta trae:
//  - contentJson: shape legacy (string[] de ingredientes) — para compat.
//  - recipeIngredients: shape estructurada con productId pre-set para
//    matches exactos (productId=null para probables y nones).
//  - pendingMatches: probables que el cliente debe confirmar con el chef
//    antes de guardar la receta. Indexa por posición en recipeIngredients.
export type ExtractedRecipeResponse = {
  title: string;
  contentJson: {
    ingredients: string[];
    method: string[];
    notes: string;
  };
  recipeIngredients: Array<{ rawText: string; productId: string | null }>;
  pendingMatches: Array<{
    ingredientIdx: number;
    productId: string;
    productName: string;
  }>;
};

// A-01 Opción A — el Asistente manda el texto visible de la receta (ya sin
// <recipe_payload>); el server lo estructura con Haiku (tool use forzado) +
// matchea contra el banco. Misma shape que uploadRecipeFile → el formulario
// /recetas/nueva lo consume igual. apiFetch ya da timeout 30s + ApiError/
// NetworkError, que saveAsRecipe traduce a un Alert claro (no fallback mudo).
export const extractRecipeFromAssistant = (text: string) =>
  apiFetch<ExtractedRecipeResponse>("/api/recipes/extract", {
    method: "POST",
    body: JSON.stringify({ text }),
  });

// Los Google Docs nativos no pasan por el picker (son "archivos virtuales"
// de Android que el SAF no entrega): el chef pega el enlace compartido y el
// server descarga el export DOCX y corre la misma extracción + matching.
export const importRecipeFromGDoc = (url: string) =>
  apiFetch<ExtractedRecipeResponse>("/api/recipes/import-gdoc", {
    method: "POST",
    body: JSON.stringify({ url }),
  });

// Multipart upload — RN's fetch + FormData({uri}) lanza "Network request
// failed" en builds standalone (SDK 56, arquitectura nueva): el request
// nunca sale del teléfono (en Expo Go no se reproduce). uploadAsync es la
// vía nativa de Expo para multipart y no depende del polyfill de fetch.
export async function uploadRecipeFile(
  uri: string,
  mimeType: string,
): Promise<ExtractedRecipeResponse> {
  const base = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
  const token = await SecureStore.getItemAsync(TOKEN_KEY).catch(() => null);

  let res: FileSystem.FileSystemUploadResult;
  try {
    res = await FileSystem.uploadAsync(`${base}/api/recipes/upload`, uri, {
      httpMethod: "POST",
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: "file",
      mimeType,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch {
    throw new NetworkError();
  }

  if (res.status < 200 || res.status >= 300) {
    let message = `HTTP ${res.status}`;
    try {
      const json = JSON.parse(res.body);
      message = json?.error ?? message;
    } catch {}
    throw new ApiError(res.status, message);
  }

  return JSON.parse(res.body) as ExtractedRecipeResponse;
}
