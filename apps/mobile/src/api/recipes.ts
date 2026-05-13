import { apiFetch, TOKEN_KEY, ApiError, NetworkError } from "./client";
import * as SecureStore from "@/src/lib/secure-storage";
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
};

export function listRecipes(filters: ListFilters = {}): Promise<Recipe[]> {
  const qs = new URLSearchParams();
  if (filters.state) qs.set("state", filters.state);
  if (filters.priority) qs.set("priority", "true");
  if (filters.q) qs.set("q", filters.q);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiFetch<Recipe[]>(`/api/recipes${suffix}`);
}

export const getRecipe = (id: string) => apiFetch<RecipeFull>(`/api/recipes/${id}`);

export const createRecipe = (data: CreateRecipeRequest) =>
  apiFetch<Recipe>("/api/recipes", { method: "POST", body: JSON.stringify(data) });

export const patchRecipe = (id: string, data: PatchRecipeRequest) =>
  apiFetch<RecipeFull>(`/api/recipes/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });

export const deleteRecipe = (id: string) =>
  apiFetch<{ ok: boolean }>(`/api/recipes/${id}`, { method: "DELETE" });

export type ExtractedRecipeResponse = {
  title: string;
  contentJson: {
    ingredients: string[];
    method: string[];
    notes: string;
  };
};

// Multipart upload — cannot use apiFetch because it forces JSON content-type.
// We send the file as { uri, name, type } which React Native turns into a
// FormData part the server reads as a Blob.
export async function uploadRecipeFile(
  uri: string,
  name: string,
  mimeType: string,
): Promise<ExtractedRecipeResponse> {
  const base = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
  const token = await SecureStore.getItemAsync(TOKEN_KEY).catch(() => null);

  const form = new FormData();
  // React Native FormData accepts this shape for file uploads; the type
  // assertion is needed because the standard DOM FormData typings don't
  // allow it. The runtime in RN handles it correctly.
  form.append("file", { uri, name, type: mimeType } as unknown as Blob);

  // Upstream extraction can take 30-40s with cold LLM cache; allow 90s.
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 90_000);

  let res: Response;
  try {
    res = await fetch(`${base}/api/recipes/upload`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
      signal: abort.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new NetworkError("request_timeout");
    }
    throw new NetworkError();
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const json = await res.json();
      message = json?.error ?? message;
    } catch {}
    throw new ApiError(res.status, message);
  }

  return res.json() as Promise<ExtractedRecipeResponse>;
}
