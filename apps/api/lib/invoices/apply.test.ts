// apps/api/lib/invoices/apply.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
const { db, tx, drafts, memory } = vi.hoisted(() => {
  const tx = {
    invoice: { findFirst: vi.fn(), updateMany: vi.fn() },
    invoiceLine: { findMany: vi.fn(), update: vi.fn() },
    product: { findFirst: vi.fn(), update: vi.fn() },
    productPriceHistory: { create: vi.fn() },
  };
  return {
    tx,
    db: { $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) },
    drafts: { createDraftProduct: vi.fn() },
    memory: { rememberSupplierItems: vi.fn() },
  };
});
vi.mock("@atelier/db", () => ({ prisma: db }));
vi.mock("../products/drafts", () => drafts);
vi.mock("./supplier-memory", () => memory);
vi.mock("../logger", () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));
import { applyInvoice } from "./apply";

const dec = (n: number) => ({ toNumber: () => n });
const line = (over: Record<string, unknown>) => ({
  id: "l0", position: 0, description: "Zucchine", code: "ZU1", quantity: dec(2), unit: "kg", packQty: null, packUnit: null,
  taxRatePct: dec(4), productId: "p1", action: "update_price", appliedPriceCents: 180, ...over,
});
const NOW = new Date("2026-10-15T09:00:00Z");
const PRICE_DAY = new Date("2026-10-10T12:00:00Z");
const run = () => applyInvoice({ invoiceId: "inv1", restaurantId: "r1", userId: "u1", now: NOW });

beforeEach(() => {
  vi.clearAllMocks();
  tx.invoice.findFirst.mockResolvedValue({ status: "review", supplierId: "s1", issuedOn: new Date("2026-10-10T00:00:00Z") });
  tx.invoice.updateMany.mockResolvedValue({ count: 1 });
  tx.invoiceLine.findMany.mockResolvedValue([line({})]);
  tx.product.findFirst.mockResolvedValue({ id: "p1", unidadCompra: "kg", precioCompra: 150, precioActualizadoAt: new Date("2026-10-01T12:00:00Z") });
  drafts.createDraftProduct.mockResolvedValue({ id: "new", name: "Fasolari", aliases: [] });
});

describe("applyInvoice", () => {
  it("claims the invoice inside the transaction, scoped to the restaurant", async () => {
    await run();
    expect(tx.invoice.findFirst).toHaveBeenCalledWith({ where: { id: "inv1", restaurantId: "r1", deletedAt: null }, select: { status: true, supplierId: true, issuedOn: true } });
    expect(tx.invoice.updateMany).toHaveBeenCalledWith({ where: { id: "inv1", status: "review" }, data: { status: "applied", appliedAt: NOW } });
  });

  it("updates the price dated at noon UTC of the invoice day, its tax and the history", async () => {
    expect(await run()).toEqual({ status: "applied", updated: 1, drafts: 0, connected: 0, ignored: 0, skipped: [] });
    expect(tx.product.findFirst).toHaveBeenCalledWith({
      where: { id: "p1", restaurantId: "r1", deletedAt: null },
      select: { id: true, unidadCompra: true, precioCompra: true, precioActualizadoAt: true },
    });
    expect(tx.product.update).toHaveBeenCalledWith({ where: { id: "p1" }, data: { precioCompra: 180, precioActualizadoAt: PRICE_DAY, taxRatePct: 4 } });
    expect(tx.productPriceHistory.create).toHaveBeenCalledWith({ data: { productId: "p1", authorId: "u1", precio: 180, unidadCompra: "kg", invoiceLineId: "l0" } });
  });

  it("a tax rate the model did not read never overwrites the product's", async () => {
    tx.invoiceLine.findMany.mockResolvedValue([line({ taxRatePct: null })]);
    await run();
    expect(tx.product.update.mock.calls[0]![0].data).not.toHaveProperty("taxRatePct");
  });

  it("a product deleted since review is skipped and reported", async () => {
    tx.product.findFirst.mockResolvedValue(null);
    expect(await run()).toMatchObject({ updated: 0, skipped: [{ position: 0, reason: "product_deleted" }] });
    expect(tx.product.update).not.toHaveBeenCalled();
  });

  it("a newer price is never overwritten by an older invoice", async () => {
    tx.product.findFirst.mockResolvedValue({ id: "p1", unidadCompra: "kg", precioCompra: 150, precioActualizadoAt: new Date("2026-10-12T08:00:00Z") });
    expect(await run()).toMatchObject({ updated: 0, skipped: [{ position: 0, reason: "newer_price" }] });
    expect(tx.product.update).not.toHaveBeenCalled();
  });

  it("creates a draft in the line's unit, links the line and records its price", async () => {
    tx.invoiceLine.findMany.mockResolvedValue([line({ id: "l1", description: "Fasolari", productId: null, action: "create_draft", appliedPriceCents: 2500 })]);
    expect(await run()).toMatchObject({ drafts: 1 });
    expect(drafts.createDraftProduct).toHaveBeenCalledWith(tx, { restaurantId: "r1", name: "Fasolari", unidadCompra: "kg", precioCompra: 2500, taxRatePct: 4, precioActualizadoAt: PRICE_DAY });
    expect(tx.invoiceLine.update).toHaveBeenCalledWith({ where: { id: "l1" }, data: { productId: "new" } });
    expect(tx.productPriceHistory.create).toHaveBeenCalledWith({ data: { productId: "new", authorId: "u1", precio: 2500, unidadCompra: "kg", invoiceLineId: "l1" } });
  });

  it("a draft without a price gets no history row", async () => {
    tx.invoiceLine.findMany.mockResolvedValue([line({ productId: null, action: "create_draft", appliedPriceCents: null, unit: null })]);
    await run();
    expect(drafts.createDraftProduct.mock.calls[0]![1]).toMatchObject({ precioCompra: 0 });
    expect(tx.productPriceHistory.create).not.toHaveBeenCalled();
  });

  it("connect and ignore write no price", async () => {
    tx.invoiceLine.findMany.mockResolvedValue([line({ action: "connect" }), line({ id: "l1", position: 1, action: "ignore", productId: null })]);
    expect(await run()).toMatchObject({ connected: 1, ignored: 1, updated: 0 });
    expect(tx.product.update).not.toHaveBeenCalled();
  });

  it("an undecided line refuses the whole apply", async () => {
    tx.invoiceLine.findMany.mockResolvedValue([line({}), line({ id: "l1", position: 1, action: null })]);
    expect(await run()).toEqual({ status: "error", code: "lines_undecided", positions: [1] });
    expect(tx.product.update).not.toHaveBeenCalled();
    expect(memory.rememberSupplierItems).not.toHaveBeenCalled();
  });

  it("a second apply, at once or later, changes nothing", async () => {
    tx.invoice.updateMany.mockResolvedValue({ count: 0 });
    tx.invoice.findFirst.mockResolvedValue({ status: "applied", supplierId: "s1", issuedOn: null });
    expect(await run()).toEqual({ status: "already_applied" });
    expect(tx.invoiceLine.findMany).not.toHaveBeenCalled();
  });

  it.each([
    [null, "invoice_not_found"],
    [{ status: "reading", supplierId: null, issuedOn: null }, "invoice_not_in_review"],
  ])("refuses an invoice that is %j", async (found, code) => {
    tx.invoice.findFirst.mockResolvedValue(found);
    tx.invoice.updateMany.mockResolvedValue({ count: 0 });
    expect(await run()).toEqual({ status: "error", code });
  });

  it("remembers what the chef confirmed after the commit, and a memory failure changes nothing", async () => {
    tx.invoiceLine.findMany.mockResolvedValue([line({}), line({ id: "l1", position: 1, action: "ignore", productId: null })]);
    memory.rememberSupplierItems.mockRejectedValue(new Error("boom"));
    expect(await run()).toMatchObject({ status: "applied", updated: 1 });
    expect(memory.rememberSupplierItems).toHaveBeenCalledWith("s1", [
      { code: "ZU1", description: "Zucchine", productId: "p1", packQty: null, packUnit: null, priceCents: 180 },
    ]);
  });

  it("without a printed date the price is dated now", async () => {
    tx.invoice.findFirst.mockResolvedValue({ status: "review", supplierId: null, issuedOn: null });
    tx.product.findFirst.mockResolvedValue({ id: "p1", unidadCompra: "kg", precioCompra: 150, precioActualizadoAt: null });
    await run();
    expect(tx.product.update.mock.calls[0]![0].data.precioActualizadoAt).toEqual(NOW);
    expect(memory.rememberSupplierItems).not.toHaveBeenCalled();
  });
});
