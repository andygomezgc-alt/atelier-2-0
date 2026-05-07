import { apiFetch } from "./client";
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
