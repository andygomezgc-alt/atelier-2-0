// apps/api/app/api/invoices/__tests__/line-patch.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { db, guard } = vi.hoisted(() => ({
  db: { invoiceLine: { findFirst: vi.fn(), updateMany: vi.fn() }, product: { findFirst: vi.fn() } },
  guard: { requireAuth: vi.fn() },
}));
vi.mock("@atelier/db", () => ({ prisma: db }));
vi.mock("@/lib/permissions-guard", () => ({ requireAuth: guard.requireAuth, isNextResponse: (v: unknown) => v instanceof Response }));
import { PATCH } from "../[id]/lines/[position]/route";

const CTX = { userId: "u1", role: "admin", restaurantId: "r1" };
const patch = (body: unknown, position = "0") =>
  PATCH(new NextRequest("https://t.local/x", { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id: "inv1", position }) });
const dec = (n: number) => ({ toNumber: () => n });
const stored = (over: Record<string, unknown> = {}) => ({
  id: "l1", position: 0, description: "Calamari 3P", quantity: dec(2), unit: "kg", packQty: null, packUnit: null,
  unitPriceCents: 1100, lineTotalCents: 2200, productId: "p1", matchLevel: "probable", appliedPriceCents: 1100,
  invoice: { status: "review" }, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  guard.requireAuth.mockResolvedValue(CTX);
  db.invoiceLine.findFirst.mockResolvedValue(stored());
  db.invoiceLine.updateMany.mockResolvedValue({ count: 1 });
  db.product.findFirst.mockResolvedValue({ id: "p1", unidadCompra: "kg" });
});

const written = () => db.invoiceLine.updateMany.mock.calls[0]![0];

describe("PATCH /api/invoices/[id]/lines/[position]", () => {
  it("looks the line up through this restaurant's live invoice", async () => {
    await patch({ action: "update_price" });
    expect(db.invoiceLine.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { position: 0, invoice: { id: "inv1", restaurantId: "r1", deletedAt: null } },
    }));
  });

  it("confirming the proposal keeps product and price", async () => {
    const res = await patch({ action: "update_price" });
    expect(res.status).toBe(200);
    expect(written()).toEqual({
      where: { id: "l1", invoice: { status: "review" } },
      data: { action: "update_price", productId: "p1", appliedPriceCents: 1100, matchLevel: "probable" },
    });
  });

  it("choosing another product re-prices the line in its unit and marks it as the chef's", async () => {
    db.invoiceLine.findFirst.mockResolvedValue(stored({ unitPriceCents: 11000, lineTotalCents: 22000, appliedPriceCents: 11000 }));
    db.product.findFirst.mockResolvedValue({ id: "p2", unidadCompra: "g" });
    await patch({ action: "update_price", productId: "p2" });
    expect(db.product.findFirst).toHaveBeenCalledWith({ where: { id: "p2", restaurantId: "r1", deletedAt: null }, select: { id: true, unidadCompra: true } });
    // 110 €/kg in a bank kept in grams: 11 cents per gram.
    expect(written().data).toEqual({ action: "update_price", productId: "p2", appliedPriceCents: 11, matchLevel: "chef" });
  });

  it("a price typed by the chef wins", async () => {
    await patch({ action: "update_price", priceCents: 1050 });
    expect(written().data).toMatchObject({ appliedPriceCents: 1050 });
  });

  it("a product of another restaurant, or deleted, is refused", async () => {
    db.product.findFirst.mockResolvedValue(null);
    const res = await patch({ action: "connect", productId: "foreign" });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "product_not_found" });
    expect(db.invoiceLine.updateMany).not.toHaveBeenCalled();
  });

  it("connect needs a product", async () => {
    db.invoiceLine.findFirst.mockResolvedValue(stored({ productId: null }));
    expect(await (await patch({ action: "connect" })).json()).toMatchObject({ code: "product_required" });
  });

  it("update_price needs a price", async () => {
    db.invoiceLine.findFirst.mockResolvedValue(stored({ appliedPriceCents: null }));
    expect(await (await patch({ action: "update_price" })).json()).toMatchObject({ code: "price_required" });
  });

  it("a draft drops the product and re-prices in its own unit", async () => {
    db.invoiceLine.findFirst.mockResolvedValue(stored({ appliedPriceCents: 99 }));
    await patch({ action: "create_draft" });
    expect(written().data).toEqual({ action: "create_draft", productId: null, appliedPriceCents: 1100, matchLevel: "probable" });
  });

  it("ignoring keeps product and price, so the chef can take it back", async () => {
    await patch({ action: "ignore" });
    expect(written().data).toEqual({ action: "ignore", productId: "p1", appliedPriceCents: 1100, matchLevel: "probable" });
  });

  it("an invoice no longer in review is refused, also when it changed meanwhile", async () => {
    db.invoiceLine.findFirst.mockResolvedValue(stored({ invoice: { status: "applied" } }));
    expect((await patch({ action: "ignore" })).status).toBe(409);
    db.invoiceLine.findFirst.mockResolvedValue(stored());
    db.invoiceLine.updateMany.mockResolvedValue({ count: 0 });
    expect(await (await patch({ action: "ignore" })).json()).toMatchObject({ code: "invoice_not_in_review" });
  });

  it.each([[{ action: "delete" }], [{ action: "update_price", priceCents: -1 }], [null]])("rejects body %j", async (body) => {
    expect((await patch(body)).status).toBe(400);
  });

  it("an unknown position is 404", async () => {
    db.invoiceLine.findFirst.mockResolvedValue(null);
    expect((await patch({ action: "ignore" }, "7")).status).toBe(404);
    expect((await patch({ action: "ignore" }, "x")).status).toBe(404);
  });
});
