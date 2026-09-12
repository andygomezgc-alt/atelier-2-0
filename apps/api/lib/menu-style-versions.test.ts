import { beforeEach, describe, expect, it, vi } from "vitest";
const { tx, prisma } = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
    restaurant: { findUnique: vi.fn(), update: vi.fn() },
    menuStyleVersion: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    menuFolder: { count: vi.fn(), update: vi.fn() },
  };
  return { tx, prisma: { $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) } };
});
vi.mock("@atelier/db", () => ({ prisma, Prisma: { DbNull: null } }));
import { activateMenuStyle, discardMenuStyle } from "./menu-style-versions";
const spec = { fontCategory: "serif", bgColor: "#ffffff", inkColor: "#111111", accentColor: "#222222",
  headingColor: "#111111", frame: "none", titleAlign: "center", titleItalic: true,
  titleSizePt: 28, dividerStyle: "none", sectionCase: "uppercase", dishLayout: "row" };
beforeEach(() => {
  vi.clearAllMocks();
  tx.restaurant.findUnique.mockResolvedValue({ menuStyleVersionId: "old", menuStyleSpec: spec, menuStyleTheme: null, menuStyleRefUrl: "https://original.test/file.pdf" });
  tx.menuStyleVersion.findFirst.mockResolvedValue({ id: "new", spec, theme: null, refUrl: null });
  tx.menuFolder.count.mockResolvedValue(1);
  tx.menuStyleVersion.updateMany.mockResolvedValue({ count: 1 });
});
describe("style activation and history", () => {
  it("activates a tenant-owned version and menu together", async () => {
    expect(await activateMenuStyle("r1", "new", "old", "m1")).toEqual({ activeVersionId: "new" });
    expect(tx.menuStyleVersion.findFirst).toHaveBeenCalledWith({ where: { id: "new", restaurantId: "r1", discardedAt: null } });
    expect(tx.menuFolder.count).toHaveBeenCalledWith({ where: { id: "m1", restaurantId: "r1", deletedAt: null } });
    expect(tx.menuFolder.update).toHaveBeenCalledWith({ where: { id: "m1" }, data: { presentationStyle: "custom" } });
    expect(tx.restaurant.update).toHaveBeenCalledWith({ where: { id: "r1" }, data: expect.objectContaining({ menuStyleVersionId: "new", menuStyleSpec: spec }) });
  });
  it("rejects a stale activation without writes", async () => {
    await expect(activateMenuStyle("r1", "new", "stale")).rejects.toMatchObject({ code: "menu_style_changed", status: 409 });
    expect(tx.restaurant.update).not.toHaveBeenCalled();
  });
  it("allows retrying the same activation after losing its response", async () => {
    tx.restaurant.findUnique.mockResolvedValue({ menuStyleVersionId: "new" });
    await expect(activateMenuStyle("r1", "new", "old")).resolves.toEqual({ activeVersionId: "new" });
  });
  it("backs up the legacy style before first activation", async () => {
    tx.restaurant.findUnique.mockResolvedValue({ menuStyleVersionId: null, menuStyleSpec: spec, menuStyleTheme: null, menuStyleRefUrl: "https://original.test/file.pdf" });
    await activateMenuStyle("r1", "new", null);
    expect(tx.menuStyleVersion.create).toHaveBeenCalledWith({ data: expect.objectContaining({ restaurantId: "r1", spec, refUrl: "https://original.test/file.pdf", activatedAt: expect.any(Date) }) });
    expect(tx.menuStyleVersion.create.mock.calls[0]![0].data).not.toHaveProperty("theme");
  });
  it("restores a previously activated version using the same operation", async () => {
    tx.menuStyleVersion.findFirst.mockResolvedValue({ id: "historic", spec, theme: null, refUrl: null, activatedAt: new Date() });
    await expect(activateMenuStyle("r1", "historic", "old")).resolves.toEqual({ activeVersionId: "historic" });
    expect(tx.$executeRaw).toHaveBeenCalledOnce();
  });
  it("rejects an invalid stored theme with a localized error before writes", async () => {
    tx.menuStyleVersion.findFirst.mockResolvedValue({ id: "new", spec, theme: {} });
    await expect(activateMenuStyle("r1", "new", "old")).rejects.toMatchObject({ code: "menu_style_invalid", status: 422 });
    expect(tx.restaurant.update).not.toHaveBeenCalled();
  });
  it("rejects unavailable or foreign versions", async () => {
    tx.menuStyleVersion.findFirst.mockResolvedValue(null);
    await expect(activateMenuStyle("r1", "foreign", "old")).rejects.toMatchObject({ status: 404 });
    expect(tx.restaurant.update).not.toHaveBeenCalled();
  });
  it("rejects foreign or deleted menus before activation", async () => {
    tx.menuFolder.count.mockResolvedValue(0);
    await expect(activateMenuStyle("r1", "new", "old", "foreign")).rejects.toMatchObject({ status: 404 });
    expect(tx.restaurant.update).not.toHaveBeenCalled();
  });
  it("refuses discarding the active style", async () => {
    await expect(discardMenuStyle("r1", "old")).rejects.toMatchObject({ code: "menu_style_active" });
    expect(tx.menuStyleVersion.updateMany).not.toHaveBeenCalled();
  });
  it("only discards never-activated proposals owned by this restaurant", async () => {
    await discardMenuStyle("r1", "new");
    expect(tx.menuStyleVersion.updateMany).toHaveBeenCalledWith({ where: { id: "new", restaurantId: "r1", activatedAt: null, discardedAt: null }, data: { discardedAt: expect.any(Date) } });
  });
});
