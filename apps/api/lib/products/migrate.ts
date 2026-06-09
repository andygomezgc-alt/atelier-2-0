// Núcleo de la migración de recetas legacy → RecipeIngredient. Extraído del
// endpoint `/api/products/migrate-recipes` para poder llamarlo también desde
// scripts admin (ej. sub-paso 5: aplicar la migración a un restaurante
// específico de la dev DB sin pasar por la UI).
//
// El endpoint solo agrega auth + audit log envoltura — la lógica de
// matching/categorización/creación de drafts/inserción vive acá.
//
// Idempotente: si una receta ya tiene RecipeIngredient rows y `force` es
// false, se skip. Con `force=true` se borran las rows existentes y se
// rescriben (útil para re-migrar después de mejorar el parser).

import { prisma } from "@atelier/db";
import { findMatch, type MatchCandidate } from "./matching";
import { defaultCriticality } from "./criticality";
import { categorizeFromName, defaultMermaPct } from "./defaults";
import { parseIngredient } from "./parser";
import { defaultPurchaseUnit } from "./purchase-unit";

export type MigrateMode = "dry-run" | "apply";
export type ProbableMatchesPolicy = "auto-link" | "leave-unmatched";

export type MigrateOptions = {
  mode: MigrateMode;
  probableMatches?: ProbableMatchesPolicy;
  force?: boolean;
};

type IngredientPlan = {
  rawText: string;
  parsedName: string;
  parsedUnit: string | null;
  parsedQty: number | null;
  level: "exact" | "probable" | "none";
  productId: string | null;
  productName: string | null;
  distance: number;
};

type RecipePlan = {
  recipeId: string;
  recipeTitle: string;
  alreadyMigrated: boolean;
  ingredients: IngredientPlan[];
};

export type MigrateReport = {
  mode: MigrateMode;
  applied: boolean;
  restaurantId: string;
  timestamp: string;
  summary: {
    totalRecipes: number;
    recipesToMigrate: number;
    recipesSkipped: number;
    totalIngredients: number;
    matches: { exact: number; probable: number; none: number };
    probableMatchesPolicy: ProbableMatchesPolicy;
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
    draftName: string;
    draftCategory: string;
    draftUnit: string;
  }>;
  result?: {
    recipesMigrated: number;
    draftsCreated: number;
    errors: Array<{ recipeId: string; error: string }>;
    migratedRecipeIds: string[];
    createdDraftIds: string[];
  };
};

// Cuenta cuántas recetas tienen ingredients[] en contentJson pero todavía
// no fueron migradas (no tienen RecipeIngredient rows). Lo usa el GET de
// migrate-recipes para que Ajustes oculte la entrada cuando no hay nada
// pendiente.
//
// Idéntica definición de "pendiente" que el apply: receta sin filas en
// RecipeIngredient + contentJson.ingredients tiene al menos un string
// no vacío. Las recetas sin contentJson legacy (ej. creadas post-Banco)
// no cuentan.
export async function countLegacyPendingForRestaurant(
  restaurantId: string,
): Promise<number> {
  const recipes = await prisma.recipe.findMany({
    where: { restaurantId, deletedAt: null },
    select: {
      contentJson: true,
      recipeIngredients: { select: { id: true } },
    },
  });
  let count = 0;
  for (const r of recipes) {
    if (r.recipeIngredients.length > 0) continue; // ya migrada
    const content = r.contentJson as { ingredients?: unknown };
    const ings = Array.isArray(content?.ingredients) ? content.ingredients : [];
    const hasLegacy = ings.some(
      (i) => typeof i === "string" && i.trim().length > 0,
    );
    if (hasLegacy) count++;
  }
  return count;
}

export async function migrateRecipesForRestaurant(
  restaurantId: string,
  actorId: string | null,
  options: MigrateOptions,
): Promise<MigrateReport> {
  const probableMatchesPolicy = options.probableMatches ?? "leave-unmatched";
  const force = options.force ?? false;

  // 1. Cargar recetas + productos del banco.
  const [recipes, products] = await Promise.all([
    prisma.recipe.findMany({
      where: { restaurantId, deletedAt: null },
      select: {
        id: true,
        title: true,
        contentJson: true,
        recipeIngredients: { select: { id: true } },
      },
    }),
    prisma.product.findMany({
      where: {
        restaurantId,
        deletedAt: null,
        estado: { in: ["activo", "borrador"] },
      },
      select: { id: true, name: true, aliases: true, category: true },
    }),
  ]);

  const candidates: MatchCandidate[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    aliases: p.aliases,
  }));

  // 2. Plan: por cada receta no migrada, parsear cada ingrediente.
  const plans: RecipePlan[] = [];
  for (const r of recipes) {
    const alreadyMigrated = r.recipeIngredients.length > 0;
    if (alreadyMigrated && !force) {
      plans.push({
        recipeId: r.id,
        recipeTitle: r.title,
        alreadyMigrated: true,
        ingredients: [],
      });
      continue;
    }
    const content = r.contentJson as { ingredients?: unknown };
    const ingArray = Array.isArray(content?.ingredients)
      ? content.ingredients
      : [];
    const ingredients: IngredientPlan[] = [];
    for (const raw of ingArray) {
      if (typeof raw !== "string" || raw.trim().length === 0) continue;
      const text = raw.trim();
      const parsed = parseIngredient(text);
      const m = findMatch(parsed.name, candidates);
      ingredients.push({
        rawText: text,
        parsedName: parsed.name,
        parsedUnit: parsed.unit,
        parsedQty: parsed.quantity,
        level: m.level,
        productId: m.productId,
        productName: m.productName,
        distance: m.distance,
      });
    }
    plans.push({
      recipeId: r.id,
      recipeTitle: r.title,
      alreadyMigrated,
      ingredients,
    });
  }

  // 3. Reporte agregado.
  let totalIngredients = 0;
  let exactCount = 0;
  let probableCount = 0;
  let noneCount = 0;
  const conflicts: MigrateReport["conflicts"] = [];
  const newDrafts: MigrateReport["newDrafts"] = [];
  let recipesToMigrate = 0;
  let recipesSkipped = 0;

  for (const p of plans) {
    if (p.alreadyMigrated && !force) {
      recipesSkipped++;
      continue;
    }
    recipesToMigrate++;
    p.ingredients.forEach((ing, idx) => {
      totalIngredients++;
      if (ing.level === "exact") exactCount++;
      else if (ing.level === "probable") {
        probableCount++;
        conflicts.push({
          recipeId: p.recipeId,
          recipeTitle: p.recipeTitle,
          ingredientIdx: idx,
          rawText: ing.rawText,
          productId: ing.productId!,
          productName: ing.productName!,
          distance: ing.distance,
        });
      } else {
        noneCount++;
        const draftCategory = categorizeFromName(ing.parsedName);
        newDrafts.push({
          recipeId: p.recipeId,
          recipeTitle: p.recipeTitle,
          ingredientIdx: idx,
          rawText: ing.rawText,
          draftName: ing.parsedName,
          draftCategory,
          draftUnit: ing.parsedUnit ?? "unidad",
        });
      }
    });
  }

  const baseReport: MigrateReport = {
    mode: options.mode,
    applied: false,
    restaurantId,
    timestamp: new Date().toISOString(),
    summary: {
      totalRecipes: recipes.length,
      recipesToMigrate,
      recipesSkipped,
      totalIngredients,
      matches: { exact: exactCount, probable: probableCount, none: noneCount },
      probableMatchesPolicy,
    },
    conflicts,
    newDrafts,
  };

  if (options.mode === "dry-run") {
    return baseReport;
  }

  // 4. Apply: crear drafts (con dedupe) + insertar RecipeIngredient.
  const migratedRecipeIds: string[] = [];
  const createdDraftIds: string[] = [];
  const errors: Array<{ recipeId: string; error: string }> = [];

  // draftCache: nombre limpio normalizado → productId — para deduplicar
  // cuando "harina" aparece en 3 recetas.
  const draftCache = new Map<string, string>();

  for (const p of plans) {
    if (p.alreadyMigrated && !force) continue;
    try {
      const resolved: Array<{
        rawText: string;
        productId: string | null;
        position: number;
        qty: number | null;
        unit: string | null;
      }> = [];

      for (let idx = 0; idx < p.ingredients.length; idx++) {
        const ing = p.ingredients[idx]!;
        let productId: string | null = null;

        if (ing.level === "exact") {
          productId = ing.productId;
        } else if (ing.level === "probable") {
          productId =
            probableMatchesPolicy === "auto-link" ? ing.productId : null;
        } else {
          // Draft nuevo: name + categoría inferida + unidadCompra del default
          // (NO del parser: la unidad del rawText es de USO en receta — ej.
          // "100g harina" — pero el banco compra en kg).
          const draftName = ing.parsedName;
          const draftCategory = categorizeFromName(draftName);
          const draftUnit = defaultPurchaseUnit(draftCategory, draftName);
          const key = draftName.trim().toLowerCase();
          const cached = draftCache.get(key);
          if (cached) {
            productId = cached;
          } else {
            const draft = await prisma.product.create({
              data: {
                restaurantId,
                name: draftName,
                category: draftCategory,
                unidadCompra: draftUnit,
                precioCompra: 0,
                mermaPct: defaultMermaPct(draftCategory),
                mermaOrigen: "sugerida",
                estado: "borrador",
                criticality: defaultCriticality(draftCategory, draftName),
                criticalityManual: false,
              },
            });
            draftCache.set(key, draft.id);
            createdDraftIds.push(draft.id);
            productId = draft.id;
          }
        }

        // qty/unit del USO en receta — los persiste para el cálculo de costo.
        resolved.push({
          rawText: ing.rawText,
          productId,
          position: idx,
          qty: ing.parsedQty,
          unit: ing.parsedUnit,
        });
      }

      await prisma.$transaction(async (tx) => {
        if (force && p.alreadyMigrated) {
          await tx.recipeIngredient.deleteMany({
            where: { recipeId: p.recipeId },
          });
        }
        if (resolved.length > 0) {
          await tx.recipeIngredient.createMany({
            data: resolved.map((ing) => ({
              recipeId: p.recipeId,
              productId: ing.productId,
              position: ing.position,
              rawText: ing.rawText,
              qty: ing.qty,
              unit: ing.unit,
            })),
          });
        }
      });

      migratedRecipeIds.push(p.recipeId);
    } catch (err) {
      errors.push({
        recipeId: p.recipeId,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  // 5. Audit log — registra qué se hizo para enabler rollback manual.
  await prisma.auditLog.create({
    data: {
      restaurantId,
      actorId,
      action: "recipe_ingredients_migrated",
      payload: {
        migratedRecipeIds,
        createdDraftIds,
        probableMatchesPolicy,
        force,
        summary: baseReport.summary,
      },
    },
  });

  return {
    ...baseReport,
    applied: true,
    result: {
      recipesMigrated: migratedRecipeIds.length,
      draftsCreated: createdDraftIds.length,
      errors,
      migratedRecipeIds,
      createdDraftIds,
    },
  };
}
