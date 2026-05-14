// POST /api/products/recalc-criticality
//
// Recálculo semanal de criticidad por peso económico (Fase 6).
//
// Para cada producto del restaurante (excluyendo los marcados como
// criticalityManual=true — el chef los fijó a mano y no los tocamos):
//
//   1. Recolectar todas las recetas donde aparece (vía RecipeIngredient).
//   2. Por cada receta, computar el costo total como suma de realCost de
//      cada ingrediente enlazado (los que tienen productId). realCost se
//      computa con la fórmula de Fase 1: precioCompra / (1 - mermaPct/100).
//   3. Calcular la cuota de este producto en cada receta = realCost / total.
//   4. Si en alguna receta la cuota > 15% → criticidad = 'alta'.
//   5. Sino → criticidad = defaultCriticality(category, name) (regla de Fase 1).
//
// Las excepciones de nombre (trufa, caviar, etc.) están dentro de
// defaultCriticality, así que cuando NO encuentra match económico el
// producto cae a la regla por categoría + nombre. Si un producto es
// inherentemente caro (caviar) sigue criticality=alta vía la excepción.
//
// Cambios se loguean en AuditLog con before/after por producto. Permiso
// 'edit_restaurant' (admin) para ejecutar manualmente; en producción se
// puede correr via Vercel Cron / GitHub Actions con un endpoint con secret
// — fuera de scope, dejo el endpoint admin-triggerable.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@atelier/db";
import type { Criticality } from "@atelier/shared";
import { withAuth } from "@/lib/with-auth";
import { logger } from "@/lib/logger";
import { defaultCriticality } from "@/lib/products/criticality";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RecalcCriticalityRequestSchema = z.object({
  // Si true, devuelve qué cambios se HARÍAN sin tocar la DB.
  dryRun: z.boolean().default(false),
});

// Umbral de "peso económico". El spec del Banco dice 15%.
const ECONOMIC_THRESHOLD = 0.15;

function realCost(precioCompra: number, mermaPctStr: string | number): number {
  const merma = typeof mermaPctStr === "number" ? mermaPctStr : Number(mermaPctStr);
  if (merma >= 100) return precioCompra;
  return Math.ceil(precioCompra / (1 - merma / 100));
}

export const POST = withAuth(
  { permission: "edit_restaurant", body: RecalcCriticalityRequestSchema },
  async (ctx, body) => {
    const restaurantId = ctx.restaurantId!;

    // Fetch productos no-manuales + sus apariciones en recetas. Los con
    // criticalityManual=true los listamos para el reporte pero no los tocamos.
    const products = await prisma.product.findMany({
      where: { restaurantId, deletedAt: null },
      select: {
        id: true,
        name: true,
        category: true,
        criticality: true,
        criticalityManual: true,
        precioCompra: true,
        mermaPct: true,
        recipeIngredients: {
          select: { recipeId: true },
        },
      },
    });

    // Para calcular la cuota necesitamos el costo total de cada receta
    // donde aparece este producto. Fetch los ingredients de TODAS las
    // recetas referenciadas, junto con el producto enlazado.
    const recipeIdsSet = new Set<string>();
    for (const p of products) {
      for (const ri of p.recipeIngredients) recipeIdsSet.add(ri.recipeId);
    }
    const recipeIds = Array.from(recipeIdsSet);

    // En una sola query traemos los costos de cada ingredient en cada receta.
    const allIngredientsInRecipes =
      recipeIds.length > 0
        ? await prisma.recipeIngredient.findMany({
            where: { recipeId: { in: recipeIds }, productId: { not: null } },
            select: {
              recipeId: true,
              productId: true,
              product: { select: { precioCompra: true, mermaPct: true } },
            },
          })
        : [];

    // Agrupamos por receta → total + por producto: cuota.
    const recipeTotals = new Map<string, number>();
    type Share = { recipeId: string; productId: string; share: number };
    const productShares = new Map<string, Share[]>();

    for (const ri of allIngredientsInRecipes) {
      if (!ri.productId || !ri.product) continue;
      const cost = realCost(
        ri.product.precioCompra,
        ri.product.mermaPct.toString(),
      );
      recipeTotals.set(ri.recipeId, (recipeTotals.get(ri.recipeId) ?? 0) + cost);
    }
    for (const ri of allIngredientsInRecipes) {
      if (!ri.productId || !ri.product) continue;
      const total = recipeTotals.get(ri.recipeId) ?? 0;
      if (total <= 0) continue;
      const cost = realCost(
        ri.product.precioCompra,
        ri.product.mermaPct.toString(),
      );
      const share = cost / total;
      const list = productShares.get(ri.productId) ?? [];
      list.push({ recipeId: ri.recipeId, productId: ri.productId, share });
      productShares.set(ri.productId, list);
    }

    // Decidir la criticidad nueva por producto.
    type Change = {
      productId: string;
      productName: string;
      from: Criticality;
      to: Criticality;
      reason: "economic" | "default";
      maxShare: number;
    };
    const changes: Change[] = [];
    const skippedManual: string[] = [];

    for (const p of products) {
      if (p.criticalityManual) {
        skippedManual.push(p.id);
        continue;
      }
      const shares = productShares.get(p.id) ?? [];
      const maxShare = shares.reduce((m, s) => Math.max(m, s.share), 0);

      let newCriticality: Criticality;
      let reason: "economic" | "default";
      if (maxShare > ECONOMIC_THRESHOLD) {
        newCriticality = "alta";
        reason = "economic";
      } else {
        newCriticality = defaultCriticality(p.category, p.name);
        reason = "default";
      }

      if (newCriticality !== p.criticality) {
        changes.push({
          productId: p.id,
          productName: p.name,
          from: p.criticality as Criticality,
          to: newCriticality,
          reason,
          maxShare,
        });
      }
    }

    const summary = {
      totalProducts: products.length,
      skippedManual: skippedManual.length,
      changes: changes.length,
      timestamp: new Date().toISOString(),
    };

    if (body.dryRun) {
      return NextResponse.json({ applied: false, summary, changes });
    }

    // Apply: update + log audit.
    if (changes.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const c of changes) {
          await tx.product.update({
            where: { id: c.productId },
            data: { criticality: c.to },
          });
        }
        await tx.auditLog.create({
          data: {
            restaurantId,
            actorId: ctx.userId,
            action: "criticality_recalc",
            payload: {
              summary,
              changes,
              skippedManual,
            },
          },
        });
      });
    }

    logger.info("criticality_recalc_applied", {
      restaurantId,
      userId: ctx.userId,
      ...summary,
    });

    return NextResponse.json({ applied: true, summary, changes });
  },
);
