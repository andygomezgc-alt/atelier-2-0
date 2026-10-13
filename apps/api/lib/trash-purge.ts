// Empties the trash: menus, recipes and products that have been in the trash
// (deletedAt set) for more than TRASH_RETENTION_DAYS are deleted for good, across
// every restaurant. Run daily by /api/cron/purge-trash.
//
// Order matters because of the foreign keys:
//   1. menus: their sections, items and client override cascade;
//   2. menu items whose recipe expired, because MenuItem.recipeId is Restrict
//      (they are already hidden from every menu by activeMenuItemsWhere);
//   3. those recipes, in the same transaction as step 2: RecipeIngredient cascades;
//   4. products: YieldTest and ProductPriceHistory cascade and
//      RecipeIngredient.productId is set to null.
// Every delete re-checks the cutoff, so a row restored meanwhile is kept.
import { prisma } from "@atelier/db";
import { logger } from "@/lib/logger";

export const TRASH_RETENTION_DAYS = 7;
export const TRASH_PURGE_BATCH_SIZE = 200;
// The route allows 300 s; keep a margin so the counts are always returned and logged.
export const TRASH_PURGE_BUDGET_MS = 240_000;

const DAY_MS = 24 * 60 * 60 * 1000;

export type TrashPurgeCounts = { menus: number; menuItems: number; recipes: number; products: number };
// complete=false: the time budget ran out; the rest goes in the next run.
export type TrashPurgeResult = TrashPurgeCounts & { complete: boolean };

export async function purgeExpiredTrash(
  now: Date,
  opts: { batchSize?: number; budgetMs?: number } = {},
): Promise<TrashPurgeResult> {
  const startedAt = Date.now();
  const batchSize = opts.batchSize ?? TRASH_PURGE_BATCH_SIZE;
  const deadline = startedAt + (opts.budgetMs ?? TRASH_PURGE_BUDGET_MS);
  const cutoff = new Date(+now - TRASH_RETENTION_DAYS * DAY_MS);
  const expired = { deletedAt: { lt: cutoff } };
  const lookup = { where: expired, select: { id: true }, orderBy: { deletedAt: "asc" as const }, take: batchSize };
  const counts: TrashPurgeCounts = { menus: 0, menuItems: 0, recipes: 0, products: 0 };

  // Deletes one batch at a time until nothing expired is left; false when out of time.
  async function drain(find: () => Promise<{ id: string }[]>, remove: (ids: string[]) => Promise<void>) {
    for (;;) {
      if (Date.now() >= deadline) return false;
      const ids = (await find()).map(row => row.id);
      if (!ids.length) return true;
      await remove(ids);
      if (ids.length < batchSize) return true;
    }
  }

  const complete =
    (await drain(() => prisma.menuFolder.findMany(lookup), ids => prisma.$transaction(async tx => {
      counts.menus += (await tx.menuFolder.deleteMany({ where: { id: { in: ids }, ...expired } })).count;
    }))) &&
    (await drain(() => prisma.recipe.findMany(lookup), ids => prisma.$transaction(async tx => {
      counts.menuItems += (await tx.menuItem.deleteMany({ where: { recipeId: { in: ids }, recipe: expired } })).count;
      counts.recipes += (await tx.recipe.deleteMany({ where: { id: { in: ids }, ...expired } })).count;
    }))) &&
    (await drain(() => prisma.product.findMany(lookup), ids => prisma.$transaction(async tx => {
      counts.products += (await tx.product.deleteMany({ where: { id: { in: ids }, ...expired } })).count;
    })));

  logger.info("trash_purge_finished", { ...counts, complete, cutoff: cutoff.toISOString(), durationMs: Date.now() - startedAt });
  return { ...counts, complete };
}
