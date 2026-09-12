import type { Prisma } from "@atelier/db";
import { detectPezzaturaFromName, type RecipeIngredientInput } from "@atelier/shared";
import { parseIngredient } from "./parser";
import { categorizeFromName, defaultMermaPct } from "./defaults";
import { defaultPurchaseUnit } from "./purchase-unit";
import { defaultCriticality } from "./criticality";
import { findMatch } from "./matching";

export class RecipeSaveError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}

// One short transaction lock for every path that creates ingredient drafts.
// Separate API workers therefore cannot create the same automatic draft concurrently.
export async function lockRecipeSave(tx: Prisma.TransactionClient, restaurantId: string) {
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`recipe-save:${restaurantId}`}))`;
}

export async function resolveIngredientDrafts(tx: Prisma.TransactionClient, restaurantId: string, ingredients: RecipeIngredientInput[]) {
  const ids = [...new Set(ingredients.flatMap(i => i.productId ? [i.productId] : []))];
  if (ids.length && await tx.product.count({ where: { id: { in: ids }, restaurantId, deletedAt: null } }) !== ids.length) {
    throw new RecipeSaveError("invalid_product_reference");
  }
  const candidates = ingredients.some(i => !i.productId && i.createProductDraft)
    ? await tx.product.findMany({ where: { restaurantId, deletedAt: null, estado: { in: ["activo", "borrador"] } }, select: { id: true, name: true, aliases: true } }) : [];
  const rows = [];
  for (const [position, ing] of ingredients.entries()) {
    const parsed = parseIngredient(ing.rawText);
    let productId = ing.productId ?? null;
    if (!productId && ing.createProductDraft) {
      const name = parsed.name || ing.rawText.trim();
      const match = findMatch(name, candidates);
      if (match.level === "exact" && match.productId) productId = match.productId;
      else {
        const category = categorizeFromName(name);
        const pezzatura = detectPezzaturaFromName(name, category);
        const created = await tx.product.create({ data: {
          restaurantId, name, category, unidadCompra: defaultPurchaseUnit(category, name), precioCompra: 0,
          mermaPct: defaultMermaPct(category), mermaOrigen: "sugerida", estado: "borrador",
          criticality: defaultCriticality(category, name), criticalityManual: false,
          pezzaturaMode: pezzatura?.mode ?? null, pezzaturaMin: pezzatura?.min ?? null, pezzaturaMax: pezzatura?.max ?? null,
        } });
        productId = created.id;
        candidates.push({ id: created.id, name: created.name, aliases: created.aliases });
      }
    }
    rows.push({ productId, position, rawText: ing.rawText,
      qty: ing.qty !== undefined ? ing.qty : parsed.quantity,
      unit: ing.unit !== undefined ? ing.unit : parsed.unit,
      pezzatura: ing.pezzatura ?? null, mermaOverridePct: ing.mermaOverridePct ?? null, pesoCalculoG: ing.pesoCalculoG ?? null });
  }
  return rows;
}
