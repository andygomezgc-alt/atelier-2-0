// Núcleo del recálculo de criticidad — extraído del endpoint
// /api/products/recalc-criticality para poder llamarlo también desde
// el cron de Vercel (`/api/cron/recalc-criticality`).
//
// Lógica (mismo spec del Banco):
//   1. Para cada producto NO marcado como criticalityManual=true,
//      recolectar todas sus apariciones en recetas via RecipeIngredient.
//   2. Costear cantidades con el mismo motor que el detalle de receta.
//   3. Sumar apariciones de cada producto y dividir por el total computable.
//   4. Si cuota > 15% en alguna receta → criticidad = "alta".
//   5. Sino → defaultCriticality(category, name).
//
// El AuditLog se graba con `actorId` del que disparó la ejecución.
// Cron pasa `actorId=null` (no hay humano detrás).

import { prisma } from "@atelier/db";
import type { Criticality } from "@atelier/shared";
import { defaultCriticality } from "./criticality";
import { computeRecipeCost } from "./cost";

// Umbral de "peso económico" — del spec.
const ECONOMIC_THRESHOLD = 0.15;

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
          where: {
            recipeId: { in: recipeIds },
            recipe: { restaurantId, deletedAt: null },
            product: { restaurantId, deletedAt: null },
          },
          select: {
            recipeId: true,
            productId: true,
            qty: true,
            unit: true,
            mermaOverridePct: true,
            pesoCalculoG: true,
            product: { select: {
              precioCompra: true, mermaPct: true, unidadCompra: true,
              pezzaturaMode: true, pezzaturaMin: true, pezzaturaMax: true,
            } },
          },
        })
      : [];

  // Total por receta + cuota por producto.
  const recipeTotals = new Map<string, number>();
  type Share = { recipeId: string; productId: string; share: number };
  const productShares = new Map<string, Share[]>();
  const amounts = computeRecipeCost({
    portions: 1,
    salePriceCents: null,
    ingredients: allIngredientsInRecipes.map(ri => ({
      qty: ri.qty === null ? null : Number(ri.qty),
      unit: ri.unit,
      mermaOverridePct: ri.mermaOverridePct == null ? null : Number(ri.mermaOverridePct),
      pesoCalculoG: ri.pesoCalculoG == null ? null : Number(ri.pesoCalculoG),
      product: ri.product ? {
        ...ri.product,
        mermaPct: Number(ri.product.mermaPct),
        pezzaturaMin: ri.product.pezzaturaMin == null ? null : Number(ri.product.pezzaturaMin),
        pezzaturaMax: ri.product.pezzaturaMax == null ? null : Number(ri.product.pezzaturaMax),
      } : null,
    })),
  }).costsByIdx;
  const recipeProductTotals = new Map<string, Map<string, number>>();
  for (const [idx, cost] of amounts) {
    const ri = allIngredientsInRecipes[idx]!;
    if (!ri.productId) continue;
    recipeTotals.set(ri.recipeId, (recipeTotals.get(ri.recipeId) ?? 0) + cost);
    const totals = recipeProductTotals.get(ri.recipeId) ?? new Map<string, number>();
    totals.set(ri.productId, (totals.get(ri.productId) ?? 0) + cost);
    recipeProductTotals.set(ri.recipeId, totals);
  }
  for (const [recipeId, totals] of recipeProductTotals) {
    const total = recipeTotals.get(recipeId) ?? 0;
    if (total <= 0) continue;
    for (const [productId, cost] of totals) {
      const list = productShares.get(productId) ?? [];
      list.push({ recipeId, productId, share: cost / total });
      productShares.set(productId, list);
    }
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

  // P2-9 (auditoría jul 2026): entre la lectura de arriba y este write, el
  // chef puede haber marcado el producto como criticalityManual=true a mano
  // (carrera con el cron). updateMany con el guard `criticalityManual: false`
  // hace que ese update sea un no-op (count===0) en vez de pisarlo; lo
  // recontamos como skippedManual para que el reporte quede coherente con lo
  // que realmente se escribió.
  let finalSummary = summary;
  let appliedChanges = changes;

  if (changes.length > 0) {
    const applied: RecalcChange[] = [];
    const raceSkippedIds: string[] = [];
    await prisma.$transaction(async (tx) => {
      for (const c of changes) {
        const res = await tx.product.updateMany({
          where: { id: c.productId, criticalityManual: false },
          data: { criticality: c.to },
        });
        if (res.count > 0) {
          applied.push(c);
        } else {
          raceSkippedIds.push(c.productId);
        }
      }
      finalSummary = {
        totalProducts: products.length,
        skippedManual: skippedManual.length + raceSkippedIds.length,
        changes: applied.length,
        timestamp: new Date().toISOString(),
      };
      appliedChanges = applied;
      await tx.auditLog.create({
        data: {
          restaurantId,
          actorId,
          action: "criticality_recalc",
          payload: {
            summary: finalSummary,
            changes: applied,
            skippedManual: [...skippedManual, ...raceSkippedIds],
          },
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

  return { applied: true, summary: finalSummary, changes: appliedChanges };
}
