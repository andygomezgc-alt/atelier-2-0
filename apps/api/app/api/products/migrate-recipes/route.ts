// Migración de recetas existentes al Banco de Productos (Fase 5).
//
// Las recetas que existían antes de la Fase 0 tienen sus ingredientes solo
// en contentJson.ingredients (array de strings). Este endpoint:
//
//   1. Escanea recetas sin filas en RecipeIngredient (no migradas).
//   2. Por cada ingrediente string, corre matching contra el banco.
//   3. dry-run → devuelve reporte JSON sin tocar la DB.
//   4. apply  → escribe RecipeIngredient (+ crea drafts para los nones)
//               dentro de transacción por receta. Idempotente: skip las
//               recetas que ya fueron migradas.
//
// Reversibilidad: cada apply guarda en AuditLog payload con recipeIds y
// draftProductIds creados. Rollback manual posible vía:
//   DELETE FROM "RecipeIngredient" WHERE recipeId IN (<ids del audit>);
//   UPDATE "Product" SET "deletedAt" = NOW() WHERE id IN (<draftIds>);
//
// Permisos: admin solamente. La acción es destructiva y per-restaurant.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@atelier/db";
import { withAuth } from "@/lib/with-auth";
import { logger } from "@/lib/logger";
import { findMatch, type MatchCandidate } from "@/lib/products/matching";
import { defaultCriticality } from "@/lib/products/criticality";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MigrateRecipesRequestSchema = z.object({
  mode: z.enum(["dry-run", "apply"]),
  // Cómo tratar matches probables (distancia 1-3). Por defecto los dejamos
  // sin enlazar — el chef los puede revisar después en cada receta.
  probableMatches: z.enum(["auto-link", "leave-unmatched"]).default("leave-unmatched"),
  // Forzar re-migración de recetas ya migradas (las RecipeIngredient rows
  // existentes se borran y se reescriben). Default false (idempotente).
  force: z.boolean().default(false),
});

type IngredientPlan = {
  rawText: string;
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

export const POST = withAuth(
  {
    permission: "edit_restaurant",
    body: MigrateRecipesRequestSchema,
  },
  async (ctx, body) => {
    const restaurantId = ctx.restaurantId!;

    // 1. Cargar todo lo necesario en una sola pasada (recetas + productos
    //    del banco). Recetas excluye soft-deleted; productos solo activos
    //    + borradores (los archivados no deberían generar matches).
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

    // 2. Build el plan: por cada receta no migrada, plan de cada ingrediente.
    const plans: RecipePlan[] = [];
    for (const r of recipes) {
      const alreadyMigrated = r.recipeIngredients.length > 0;
      if (alreadyMigrated && !body.force) {
        plans.push({
          recipeId: r.id,
          recipeTitle: r.title,
          alreadyMigrated: true,
          ingredients: [],
        });
        continue;
      }

      const content = r.contentJson as { ingredients?: unknown };
      const ingArray = Array.isArray(content?.ingredients) ? content.ingredients : [];
      const ingredients: IngredientPlan[] = [];
      for (const raw of ingArray) {
        if (typeof raw !== "string" || raw.trim().length === 0) continue;
        const text = raw.trim();
        const m = findMatch(text, candidates);
        ingredients.push({
          rawText: text,
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

    // 3. Reporte (sirve para dry-run y para summary del apply).
    let totalIngredients = 0;
    let exactCount = 0;
    let probableCount = 0;
    let noneCount = 0;
    const probableConflicts: Array<{
      recipeId: string;
      recipeTitle: string;
      ingredientIdx: number;
      rawText: string;
      productId: string;
      productName: string;
      distance: number;
    }> = [];
    const noneIngredients: Array<{
      recipeId: string;
      recipeTitle: string;
      ingredientIdx: number;
      rawText: string;
    }> = [];

    let recipesToMigrate = 0;
    let recipesSkipped = 0;
    for (const p of plans) {
      if (p.alreadyMigrated && !body.force) {
        recipesSkipped++;
        continue;
      }
      recipesToMigrate++;
      p.ingredients.forEach((ing, idx) => {
        totalIngredients++;
        if (ing.level === "exact") exactCount++;
        else if (ing.level === "probable") {
          probableCount++;
          probableConflicts.push({
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
          noneIngredients.push({
            recipeId: p.recipeId,
            recipeTitle: p.recipeTitle,
            ingredientIdx: idx,
            rawText: ing.rawText,
          });
        }
      });
    }

    const report = {
      mode: body.mode,
      restaurantId,
      timestamp: new Date().toISOString(),
      summary: {
        totalRecipes: recipes.length,
        recipesToMigrate,
        recipesSkipped,
        totalIngredients,
        matches: { exact: exactCount, probable: probableCount, none: noneCount },
        probableMatchesPolicy: body.probableMatches,
      },
      conflicts: probableConflicts,
      newDrafts: noneIngredients,
    };

    // 4. Si es dry-run, devolvemos el reporte y nos vamos.
    if (body.mode === "dry-run") {
      return NextResponse.json({ ...report, applied: false });
    }

    // 5. Apply: ejecutar el plan.
    const migratedRecipeIds: string[] = [];
    const createdDraftIds: string[] = [];
    const errors: Array<{ recipeId: string; error: string }> = [];

    // Cache de drafts creados para deduplicar — si "harina de garbanzos"
    // aparece en 3 recetas y no hay match, creamos UN solo producto y lo
    // reusamos en las 3.
    const draftCache = new Map<string, string>(); // normalized name -> productId

    for (const p of plans) {
      if (p.alreadyMigrated && !body.force) continue;

      try {
        // Resolver productIds para cada ingrediente, creando drafts si hace falta.
        const resolvedIngredients: Array<{
          rawText: string;
          productId: string | null;
          position: number;
        }> = [];

        for (let idx = 0; idx < p.ingredients.length; idx++) {
          const ing = p.ingredients[idx]!;
          let productId: string | null = null;

          if (ing.level === "exact") {
            productId = ing.productId;
          } else if (ing.level === "probable") {
            productId =
              body.probableMatches === "auto-link" ? ing.productId : null;
          } else {
            // none → crear draft (o reusar si ya creamos uno con el mismo texto).
            const key = ing.rawText.trim().toLowerCase();
            const cached = draftCache.get(key);
            if (cached) {
              productId = cached;
            } else {
              const draft = await prisma.product.create({
                data: {
                  restaurantId,
                  name: ing.rawText,
                  category: "otro",
                  unidadCompra: "unidad",
                  precioCompra: 0,
                  mermaPct: 0,
                  mermaOrigen: "sugerida",
                  estado: "borrador",
                  criticality: defaultCriticality("otro", ing.rawText),
                  criticalityManual: false,
                },
              });
              draftCache.set(key, draft.id);
              createdDraftIds.push(draft.id);
              productId = draft.id;
            }
          }

          resolvedIngredients.push({
            rawText: ing.rawText,
            productId,
            position: idx,
          });
        }

        // Transacción por receta: si --force borramos existentes, luego insertamos.
        await prisma.$transaction(async (tx) => {
          if (body.force && p.alreadyMigrated) {
            await tx.recipeIngredient.deleteMany({ where: { recipeId: p.recipeId } });
          }
          if (resolvedIngredients.length > 0) {
            await tx.recipeIngredient.createMany({
              data: resolvedIngredients.map((ing) => ({
                recipeId: p.recipeId,
                productId: ing.productId,
                position: ing.position,
                rawText: ing.rawText,
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

    // 6. Audit log — registra qué hicimos para enabler rollback manual.
    await prisma.auditLog.create({
      data: {
        restaurantId,
        actorId: ctx.userId,
        action: "recipe_ingredients_migrated",
        payload: {
          migratedRecipeIds,
          createdDraftIds,
          probableMatchesPolicy: body.probableMatches,
          force: body.force,
          summary: report.summary,
        },
      },
    });

    logger.info("recipe_ingredients_migrated", {
      restaurantId,
      userId: ctx.userId,
      recipes: migratedRecipeIds.length,
      drafts: createdDraftIds.length,
      errors: errors.length,
    });

    return NextResponse.json({
      ...report,
      applied: true,
      result: {
        recipesMigrated: migratedRecipeIds.length,
        draftsCreated: createdDraftIds.length,
        errors,
      },
    });
  },
);
