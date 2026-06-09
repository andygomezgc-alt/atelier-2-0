// Núcleo del recálculo de criticidad — extraído del endpoint
// /api/products/recalc-criticality para poder llamarlo también desde
// el cron de Vercel (`/api/cron/recalc-criticality`).
//
// Lógica (mismo spec del Banco):
//   1. Para cada producto NO marcado como criticalityManual=true,
//      recolectar todas sus apariciones en recetas via RecipeIngredient.
//   2. Por cada receta, el costo total = suma(realCost de ingredientes
//      enlazados). realCost = precioCompra / (1 - mermaPct/100).
//   3. Cuota del producto en la receta = realCost(producto) / total.
//   4. Si cuota > 15% en alguna receta → criticidad = "alta".
//   5. Sino → defaultCriticality(category, name).
//
// El AuditLog se graba con `actorId` del que disparó la ejecución.
// Cron pasa `actorId=null` (no hay humano detrás).

import { prisma } from "@atelier/db";
import type { Criticality } from "@atelier/shared";
import { defaultCriticality } from "./criticality";

// Umbral de "peso económico" — del spec.
const ECONOMIC_THRESHOLD = 0.15;

function realCost(precioCompra: number, mermaPctStr: string | number): number {
  const merma = typeof mermaPctStr === "number" ? mermaPctStr : Number(mermaPctStr);
  if (merma >= 100) return precioCompra;
  return Math.ceil(precioCompra / (1 - merma / 100));
}

export type RecalcChange = {
  productId: string;
  productName: string;
  from: Criticality;
  to: Criticality;
  reason: "economic" | "default";
  maxShare: number;
};

export type RecalcSummary = {
  totalProducts: number;
  skippedManual: number;
  changes: number;
  timestamp: string;
};

export type RecalcReport = {
  applied: boolean;
  summary: RecalcSummary;
  changes: RecalcChange[];
};

export async function recalcCriticalityForRestaurant(
  restaurantId: string,
  actorId: string | null,
  options: { dryRun?: boolean } = {},
): Promise<RecalcReport> {
  // Productos del restaurante (incluyendo manuales para reportarlos en el
  // count "skippedManual"). Soft-deleted excluidos.
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
      recipeIngredients: { select: { recipeId: true } },
    },
  });

  // Set de recetas afectadas — necesarias para calcular el costo total por
  // receta (denominador de la cuota).
  const recipeIdsSet = new Set<string>();
  for (const p of products) {
    for (const ri of p.recipeIngredients) recipeIdsSet.add(ri.recipeId);
  }
  const recipeIds = Array.from(recipeIdsSet);

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

  // Total por receta + cuota por producto.
  const recipeTotals = new Map<string, number>();
  type Share = { recipeId: string; productId: string; share: number };
  const productShares = new Map<string, Share[]>();

  for (const ri of allIngredientsInRecipes) {
    if (!ri.productId || !ri.product) continue;
    const cost = realCost(ri.product.precioCompra, ri.product.mermaPct.toString());
    recipeTotals.set(ri.recipeId, (recipeTotals.get(ri.recipeId) ?? 0) + cost);
  }
  for (const ri of allIngredientsInRecipes) {
    if (!ri.productId || !ri.product) continue;
    const total = recipeTotals.get(ri.recipeId) ?? 0;
    if (total <= 0) continue;
    const cost = realCost(ri.product.precioCompra, ri.product.mermaPct.toString());
    const share = cost / total;
    const list = productShares.get(ri.productId) ?? [];
    list.push({ recipeId: ri.recipeId, productId: ri.productId, share });
    productShares.set(ri.productId, list);
  }

  const changes: RecalcChange[] = [];
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

  const summary: RecalcSummary = {
    totalProducts: products.length,
    skippedManual: skippedManual.length,
    changes: changes.length,
    timestamp: new Date().toISOString(),
  };

  if (options.dryRun) {
    return { applied: false, summary, changes };
  }

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
          actorId,
          action: "criticality_recalc",
          payload: { summary, changes, skippedManual },
        },
      });
    });
  } else {
    // Aunque no haya cambios, dejamos rastro de que se ejecutó (para que
    // la pantalla Ajustes muestre "Último: hace X días" correctamente).
    // Solo en runs no-dry-run.
    await prisma.auditLog.create({
      data: {
        restaurantId,
        actorId,
        action: "criticality_recalc",
        payload: { summary, changes: [], skippedManual },
      },
    });
  }

  return { applied: true, summary, changes };
}
