import type { Role } from "./types";

// Only admins can edit approved recipes, including sale price and allergens.
// Executive chefs and sous-chefs keep uploads in testing so they are not locked out.
export function importedRecipeState(role: Role): "approved" | "in_test" {
  return role === "admin" ? "approved" : "in_test";
}
