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
// A failing row is skipped and logged and a failing stage does not stop the next
// ones, so one bad row cannot block the purge day after day.
import { prisma } from "@atelier/db";
import { logger } from "@/lib/logger";

export const TRASH_RETENTION_DAYS = 7;
export const TRASH_PURGE_BATCH_SIZE = 200;
// The route allows 300 s; keep a margin so the counts are always returned and logged.
export const TRASH_PURGE_BUDGET_MS = 240_000;

const DAY_MS = 24 * 60 * 60 * 1000;

export type TrashPurgeCounts = { menus: number; menuItems: number; recipes: number; products: number };
type Stage = "menus" | "recipes" | "products";
// complete=false: the time budget ran out; the rest goes in the next run.
// failed: rows skipped because their own delete kept failing; they are retried tomorrow.
// aborted: stages stopped by an error outside a delete (e.g. the lookup); the next stages still ran.
export type TrashPurgeResult = TrashPurgeCounts & { complete: boolean; failed: Record<Stage, number>; aborted: Stage[] };

// Error code and message only: the purge works on ids, no personal data reaches the error.
function errorInfo(error: unknown) {
  const code = (error as { code?: unknown } | null)?.code;
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 300);
  return typeof code === "string" ? { code, message } : { message };
}

export async function purgeExpiredTrash(
  now: Date,
  opts: { batchSize?: number; budgetMs?: number } = {},
): Promise<TrashPurgeResult> {
  const startedAt = Date.now();
  const batchSize = opts.batchSize ?? TRASH_PURGE_BATCH_SIZE;
  const deadline = startedAt + (opts.budgetMs ?? TRASH_PURGE_BUDGET_MS);
  const cutoff = new Date(+now - TRASH_RETENTION_DAYS * DAY_MS);
  const expired = { deletedAt: { lt: cutoff } };
  const counts: TrashPurgeCounts = { menus: 0, menuItems: 0, recipes: 0, products: 0 };
  const failed: Record<Stage, number> = { menus: 0, recipes: 0, products: 0 };
  const aborted: Stage[] = [];

  // Oldest first, leaving out the ids that already failed in this run so they cannot block the stage.
  const lookup = (skipped: string[]) => ({
    where: skipped.length ? { ...expired, id: { notIn: skipped } } : expired,
    select: { id: true }, orderBy: { deletedAt: "asc" as const }, take: batchSize,
  });

  // Deletes one batch per transaction until nothing expired is left; false when out of time.
  // A failing batch is retried one id per transaction; an id that still fails is skipped.
  // `remove` returns the counts so they are added only once its transaction committed.
  async function drain(
    stage: Stage,
    find: (skipped: string[]) => Promise<{ id: string }[]>,
    remove: (ids: string[]) => Promise<Partial<TrashPurgeCounts>>,
  ) {
    const skipped: string[] = [];
    const commit = async (ids: string[]) => {
      for (const [key, value] of Object.entries(await remove(ids))) counts[key as keyof TrashPurgeCounts] += value;
    };
    try {
      for (;;) {
        if (Date.now() >= deadline) return false;
        const ids = (await find(skipped)).map(row => row.id);
        if (!ids.length) return true;
        try {
          await commit(ids);
        } catch (error) {
          logger.warn("trash_purge_batch_failed", { stage, size: ids.length, ...errorInfo(error) });
          for (const id of ids) {
            if (Date.now() >= deadline) return false;
            try {
              await commit([id]);
            } catch (rowError) {
              skipped.push(id);
              failed[stage] += 1;
              logger.error("trash_purge_row_failed", { stage, id, ...errorInfo(rowError) });
            }
          }
        }
        if (ids.length < batchSize) return true;
      }
    } catch (error) {
      aborted.push(stage);
      logger.error("trash_purge_stage_failed", { stage, ...errorInfo(error) });
      return true;
    }
  }

  const complete =
    (await drain("menus", skipped => prisma.menuFolder.findMany(lookup(skipped)), ids => prisma.$transaction(async tx => ({
      menus: (await tx.menuFolder.deleteMany({ where: { id: { in: ids }, ...expired } })).count,
    })))) &&
    (await drain("recipes", skipped => prisma.recipe.findMany(lookup(skipped)), ids => prisma.$transaction(async tx => ({
      menuItems: (await tx.menuItem.deleteMany({ where: { recipeId: { in: ids }, recipe: expired } })).count,
      recipes: (await tx.recipe.deleteMany({ where: { id: { in: ids }, ...expired } })).count,
    })))) &&
    (await drain("products", skipped => prisma.product.findMany(lookup(skipped)), ids => prisma.$transaction(async tx => ({
      products: (await tx.product.deleteMany({ where: { id: { in: ids }, ...expired } })).count,
    }))));

  const result = { ...counts, complete, failed, aborted };
  logger.info("trash_purge_finished", { ...result, cutoff: cutoff.toISOString(), durationMs: Date.now() - startedAt });
  return result;
}
