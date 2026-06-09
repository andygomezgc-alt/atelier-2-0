// Helper: cuántas recetas (distinct) usan un producto vía RecipeIngredient.
//
// Se usa en projectProductDetail para que el ConfirmSheet de archivar
// pueda decir "Está usado en N recetas". Excluye recetas soft-deleted.
//
// "Distinct por recipeId" porque un producto puede aparecer 2+ veces en la
// misma receta (raro pero posible: dos ingredientes con el mismo banco).

import { prisma } from "@atelier/db";

export async function countRecipesUsingProduct(productId: string): Promise<number> {
  const rows = await prisma.recipeIngredient.findMany({
    where: { productId, recipe: { deletedAt: null } },
    select: { recipeId: true },
    distinct: ["recipeId"],
  });
  return rows.length;
}

// Entrega A.5 — cuenta recetas distinct que usan este producto con unidad
// "piezas" o "unidad" (variantes de "por unidad"). Determina si el editor
// muestra el campo pezzatura en vista principal (>0) o en accordion (===0),
// y si en el banco mostrar el indicador pasivo "pezzatura pendiente".
export async function countRecipesUsingProductByUnit(
  productId: string,
): Promise<number> {
  const rows = await prisma.recipeIngredient.findMany({
    where: {
      productId,
      recipe: { deletedAt: null },
      unit: { in: ["piezas", "unidad"] },
    },
    select: { recipeId: true },
    distinct: ["recipeId"],
  });
  return rows.length;
}
