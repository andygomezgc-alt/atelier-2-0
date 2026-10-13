import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// In-memory stand-in for the four tables the purge touches. It interprets only the
// where-clause shapes the purge is expected to send and throws on anything else, and it
// enforces the two foreign keys that matter: MenuItem.menuFolderId (Cascade) and
// MenuItem.recipeId (Restrict).
type Trashable = { id: string; deletedAt: Date | null };
type Item = { id: string; menuFolderId: string; recipeId: string };
type Where = Record<string, unknown>;

const { db, logger, store, journal } = vi.hoisted(() => {
  const store = {
    menus: [] as Trashable[],
    items: [] as Item[],
    recipes: [] as Trashable[],
    products: [] as Trashable[],
  };
  const journal = { tx: 0, inTx: 0, calls: [] as string[] };
  return {
    store,
    journal,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    db: {
      menuFolder: { findMany: vi.fn(), deleteMany: vi.fn() },
      menuItem: { deleteMany: vi.fn() },
      recipe: { findMany: vi.fn(), deleteMany: vi.fn() },
      product: { findMany: vi.fn(), deleteMany: vi.fn() },
      $transaction: vi.fn(),
    },
  };
});
vi.mock("@atelier/db", () => ({ prisma: db }));
vi.mock("@/lib/logger", () => ({ logger }));

import { purgeExpiredTrash, TRASH_RETENTION_DAYS } from "./trash-purge";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-10-13T03:30:00Z");
const cutoff = new Date(+now - 7 * DAY);
const daysAgo = (days: number) => new Date(+now - days * DAY);

function expiredBefore(where: Where, row: Trashable): boolean {
  const deletedAt = where.deletedAt as { lt: Date } | undefined;
  if (!deletedAt || !(deletedAt.lt instanceof Date) || Object.keys(deletedAt).join() !== "lt") {
    throw new Error(`unexpected deletedAt filter ${JSON.stringify(deletedAt)}`);
  }
  return row.deletedAt !== null && row.deletedAt < deletedAt.lt;
}

function onlyKeys(where: Where, keys: string[]) {
  const extra = Object.keys(where).filter(key => !keys.includes(key));
  if (extra.length) throw new Error(`unexpected where keys ${extra.join()}`);
}

function findExpired(rows: () => Trashable[]) {
  return async ({ where, take, select }: { where: Where; take: number; select: unknown }) => {
    onlyKeys(where, ["deletedAt"]);
    expect(select).toEqual({ id: true });
    return rows()
      .filter(row => expiredBefore(where, row))
      .sort((a, b) => +a.deletedAt! - +b.deletedAt!)
      .slice(0, take)
      .map(({ id }) => ({ id }));
  };
}

function deleteExpired(name: string, rows: () => Trashable[], set: (next: Trashable[]) => void, beforeDelete?: (ids: string[]) => void) {
  return async ({ where }: { where: Where }) => {
    onlyKeys(where, ["id", "deletedAt"]);
    journal.calls.push(`${name}@${journal.inTx ? journal.tx : "none"}`);
    const ids = (where.id as { in: string[] }).in;
    const doomed = rows().filter(row => ids.includes(row.id) && expiredBefore(where, row)).map(row => row.id);
    beforeDelete?.(doomed);
    set(rows().filter(row => !doomed.includes(row.id)));
    return { count: doomed.length };
  };
}

function seed(data: Partial<typeof store>) {
  store.menus = data.menus ?? [];
  store.items = data.items ?? [];
  store.recipes = data.recipes ?? [];
  store.products = data.products ?? [];
}

beforeEach(() => {
  vi.clearAllMocks();
  seed({});
  journal.tx = 0;
  journal.inTx = 0;
  journal.calls = [];
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => Promise<unknown>) => {
    journal.tx += 1;
    journal.inTx += 1;
    try { return await fn(db); } finally { journal.inTx -= 1; }
  });
  db.menuFolder.findMany.mockImplementation(findExpired(() => store.menus));
  db.menuFolder.deleteMany.mockImplementation(deleteExpired("menuFolder", () => store.menus, next => { store.menus = next; }, ids => {
    // MenuItem.menuFolderId is onDelete: Cascade.
    store.items = store.items.filter(item => !ids.includes(item.menuFolderId));
  }));
  db.menuItem.deleteMany.mockImplementation(async ({ where }: { where: Where }) => {
    onlyKeys(where, ["recipeId", "recipe"]);
    journal.calls.push(`menuItem@${journal.inTx ? journal.tx : "none"}`);
    const recipeIds = (where.recipeId as { in: string[] }).in;
    const recipeWhere = where.recipe as Where;
    onlyKeys(recipeWhere, ["deletedAt"]);
    const doomed = store.items.filter(item => {
      const recipe = store.recipes.find(row => row.id === item.recipeId);
      return recipeIds.includes(item.recipeId) && !!recipe && expiredBefore(recipeWhere, recipe);
    });
    store.items = store.items.filter(item => !doomed.includes(item));
    return { count: doomed.length };
  });
  db.recipe.findMany.mockImplementation(findExpired(() => store.recipes));
  db.recipe.deleteMany.mockImplementation(deleteExpired("recipe", () => store.recipes, next => { store.recipes = next; }, ids => {
    // MenuItem.recipeId is onDelete: Restrict.
    if (store.items.some(item => ids.includes(item.recipeId))) throw new Error("Foreign key constraint violated: MenuItem_recipeId_fkey");
  }));
  db.product.findMany.mockImplementation(findExpired(() => store.products));
  db.product.deleteMany.mockImplementation(deleteExpired("product", () => store.products, next => { store.products = next; }));
});
afterEach(() => { vi.useRealTimers(); });

describe("purgeExpiredTrash", () => {
  it("keeps a 7-day retention", () => {
    expect(TRASH_RETENTION_DAYS).toBe(7);
  });

  it("deletes rows trashed more than 7 days ago and never touches newer or active rows", async () => {
    const ages = (prefix: string) => [
      { id: `${prefix}-8d`, deletedAt: daysAgo(8) },
      { id: `${prefix}-7d`, deletedAt: daysAgo(7) },
      { id: `${prefix}-7d-1ms`, deletedAt: new Date(+cutoff - 1) },
      { id: `${prefix}-6d`, deletedAt: daysAgo(6) },
      { id: `${prefix}-active`, deletedAt: null },
    ];
    seed({ menus: ages("menu"), recipes: ages("recipe"), products: ages("product") });

    const result = await purgeExpiredTrash(now);

    expect(result).toEqual({ menus: 2, menuItems: 0, recipes: 2, products: 2, complete: true });
    for (const [prefix, rows] of [["menu", store.menus], ["recipe", store.recipes], ["product", store.products]] as const) {
      // Exactly 7 days is not older than the cutoff: it stays one more day.
      expect(rows.map(row => row.id)).toEqual([`${prefix}-7d`, `${prefix}-6d`, `${prefix}-active`]);
    }
  });

  it("sends a strict cutoff of now minus 7 days and re-checks it when deleting", async () => {
    seed({ menus: [{ id: "m1", deletedAt: daysAgo(9) }], recipes: [{ id: "r1", deletedAt: daysAgo(9) }], products: [{ id: "p1", deletedAt: daysAgo(9) }] });

    await purgeExpiredTrash(now);

    const find = { where: { deletedAt: { lt: cutoff } }, select: { id: true }, orderBy: { deletedAt: "asc" }, take: 200 };
    expect(db.menuFolder.findMany).toHaveBeenCalledWith(find);
    expect(db.recipe.findMany).toHaveBeenCalledWith(find);
    expect(db.product.findMany).toHaveBeenCalledWith(find);
    // A row restored between the lookup and the delete is left alone.
    expect(db.menuFolder.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["m1"] }, deletedAt: { lt: cutoff } } });
    expect(db.menuItem.deleteMany).toHaveBeenCalledWith({ where: { recipeId: { in: ["r1"] }, recipe: { deletedAt: { lt: cutoff } } } });
    expect(db.recipe.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["r1"] }, deletedAt: { lt: cutoff } } });
    expect(db.product.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["p1"] }, deletedAt: { lt: cutoff } } });
  });

  it("deletes menus, then the menu items blocking expired recipes with those recipes, then products, each batch in a transaction", async () => {
    seed({
      menus: [{ id: "m-old", deletedAt: daysAgo(10) }, { id: "m-live", deletedAt: null }],
      items: [{ id: "i1", menuFolderId: "m-live", recipeId: "r-old" }],
      recipes: [{ id: "r-old", deletedAt: daysAgo(10) }],
      products: [{ id: "p-old", deletedAt: daysAgo(10) }],
    });

    await purgeExpiredTrash(now);

    expect(journal.calls).toEqual(["menuFolder@1", "menuItem@2", "recipe@2", "product@3"]);
  });

  it("removes a trashed recipe still used by an active menu, and only its dish leaves the menu", async () => {
    seed({
      menus: [{ id: "m-live", deletedAt: null }],
      items: [
        { id: "i-gone", menuFolderId: "m-live", recipeId: "r-old" },
        { id: "i-kept", menuFolderId: "m-live", recipeId: "r-live" },
        { id: "i-recent", menuFolderId: "m-live", recipeId: "r-recent" },
      ],
      recipes: [{ id: "r-old", deletedAt: daysAgo(8) }, { id: "r-live", deletedAt: null }, { id: "r-recent", deletedAt: daysAgo(2) }],
    });

    const result = await purgeExpiredTrash(now);

    expect(result).toMatchObject({ menuItems: 1, recipes: 1 });
    expect(store.menus.map(menu => menu.id)).toEqual(["m-live"]);
    expect(store.items.map(item => item.id)).toEqual(["i-kept", "i-recent"]);
    expect(store.recipes.map(recipe => recipe.id)).toEqual(["r-live", "r-recent"]);
  });

  it("does not count the dishes that went with an expired menu", async () => {
    seed({
      menus: [{ id: "m-old", deletedAt: daysAgo(9) }],
      items: [{ id: "i1", menuFolderId: "m-old", recipeId: "r-old" }],
      recipes: [{ id: "r-old", deletedAt: daysAgo(9) }],
    });

    expect(await purgeExpiredTrash(now)).toEqual({ menus: 1, menuItems: 0, recipes: 1, products: 0, complete: true });
    expect(store.items).toEqual([]);
  });

  it("loops in batches until nothing expired is left", async () => {
    seed({ recipes: ["a", "b", "c", "d", "e"].map((id, index) => ({ id, deletedAt: daysAgo(20 - index) })) });

    const result = await purgeExpiredTrash(now, { batchSize: 2 });

    expect(result.recipes).toBe(5);
    expect(db.recipe.deleteMany.mock.calls.map(([args]) => args.where.id.in)).toEqual([["a", "b"], ["c", "d"], ["e"]]);
    expect(db.recipe.findMany).toHaveBeenCalledTimes(3);
    expect(store.recipes).toEqual([]);
    // One transaction per batch.
    expect(journal.calls).toEqual(["menuItem@1", "recipe@1", "menuItem@2", "recipe@2", "menuItem@3", "recipe@3"]);
  });

  it("asks again after a full batch, so a final empty lookup ends the loop", async () => {
    seed({ products: ["a", "b"].map(id => ({ id, deletedAt: daysAgo(30) })) });

    expect((await purgeExpiredTrash(now, { batchSize: 2 })).products).toBe(2);
    expect(db.product.findMany).toHaveBeenCalledTimes(2);
    expect(db.product.deleteMany).toHaveBeenCalledTimes(1);
  });

  it("stops starting batches once the time budget is spent and reports an incomplete run", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    seed({
      menus: ["m1", "m2", "m3"].map(id => ({ id, deletedAt: daysAgo(30) })),
      recipes: [{ id: "r1", deletedAt: daysAgo(30) }],
      products: [{ id: "p1", deletedAt: daysAgo(30) }],
    });
    const deleteMenus = db.menuFolder.deleteMany.getMockImplementation()!;
    db.menuFolder.deleteMany.mockImplementation(async args => {
      vi.setSystemTime(Date.now() + 1_000);
      return deleteMenus(args);
    });

    const result = await purgeExpiredTrash(now, { batchSize: 1, budgetMs: 1_500 });

    expect(result).toEqual({ menus: 2, menuItems: 0, recipes: 0, products: 0, complete: false });
    expect(db.recipe.findMany).not.toHaveBeenCalled();
    expect(db.product.findMany).not.toHaveBeenCalled();
    expect(store.products).toHaveLength(1);
  });

  it("logs the counts", async () => {
    seed({ menus: [{ id: "m1", deletedAt: daysAgo(8) }], products: [{ id: "p1", deletedAt: daysAgo(8) }] });

    await purgeExpiredTrash(now);

    expect(logger.info).toHaveBeenCalledWith("trash_purge_finished", expect.objectContaining({
      menus: 1, menuItems: 0, recipes: 0, products: 1, complete: true, cutoff: cutoff.toISOString(),
    }));
  });

  it("does nothing when the trash holds nothing old enough", async () => {
    seed({ recipes: [{ id: "r1", deletedAt: daysAgo(1) }] });

    expect(await purgeExpiredTrash(now)).toEqual({ menus: 0, menuItems: 0, recipes: 0, products: 0, complete: true });
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
