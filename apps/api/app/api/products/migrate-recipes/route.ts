// Migración de recetas existentes al Banco de Productos.
//
// Las recetas que existían antes de la Fase 0 tienen sus ingredientes solo
// en contentJson.ingredients (array de strings). Este endpoint:
//
//   1. Escanea recetas sin filas en RecipeIngredient (no migradas).
//   2. Por cada ingrediente string, corre parser + matching + categorización.
//   3. dry-run → devuelve reporte JSON sin tocar la DB.
//   4. apply  → escribe RecipeIngredient (+ crea drafts para los nones).
//
// El núcleo vive en `lib/products/migrate.ts` para que también lo pueda usar
// un script admin (sub-paso 5 lo usa para aplicar al Ristorante Marche desde
// CLI sin pasar por la UI). Este archivo solo es envoltura HTTP + auth.
//
// Permisos: admin solamente. La acción es destructiva y per-restaurant.

import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/with-auth";
import { logger } from "@/lib/logger";
import {
  migrateRecipesForRestaurant,
  countLegacyPendingForRestaurant,
} from "@/lib/products/migrate";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MigrateRecipesRequestSchema = z.object({
  mode: z.enum(["dry-run", "apply"]),
  probableMatches: z
    .enum(["auto-link", "leave-unmatched"])
    .default("leave-unmatched"),
  force: z.boolean().default(false),
});

// GET — devuelve cuántas recetas legacy quedan pendientes. Lo usa Ajustes
// para mostrar/ocultar la entrada "Migrar recetas legacy" — si hay 0, no
// tiene sentido mostrar la acción (el chef nunca verá ese botón después
// de migrar todo).
//
// Permiso abierto a cualquier rol del restaurante: es info no destructiva
// y el botón en UI igual está detrás del gate de admin.
export const GET = withAuth({}, async (ctx) => {
  const pendingCount = await countLegacyPendingForRestaurant(ctx.restaurantId!);
  return NextResponse.json({ pendingCount });
});

export const POST = withAuth(
  {
    permission: "edit_restaurant",
    body: MigrateRecipesRequestSchema,
  },
  async (ctx, body) => {
    const restaurantId = ctx.restaurantId!;
    const report = await migrateRecipesForRestaurant(restaurantId, ctx.userId, {
      mode: body.mode,
      probableMatches: body.probableMatches,
      force: body.force,
    });
    if (report.applied) {
      logger.info("recipe_ingredients_migrated", {
        restaurantId,
        userId: ctx.userId,
        trigger: "manual",
        recipes: report.result?.recipesMigrated ?? 0,
        drafts: report.result?.draftsCreated ?? 0,
        errors: report.result?.errors.length ?? 0,
      });
    }
    return NextResponse.json(report);
  },
);
