// apps/api/lib/invoices/propose.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
const { db, pipeline } = vi.hoisted(() => ({
  db: { supplierItem: { findMany: vi.fn() }, product: { findMany: vi.fn() } },
  pipeline: { loadMatchCandidates: vi.fn() },
}));
vi.mock("@atelier/db", () => ({ prisma: db }));
vi.mock("../recipes/extraction-pipeline", () => pipeline);
vi.mock("../logger", () => ({ logger: { warn: vi.fn(), info: vi.fn() } }));
import { proposeInvoiceLines } from "./propose";
import type { ExtractedInvoiceLine } from "./extraction";

const line = (over: Partial<ExtractedInvoiceLine>): ExtractedInvoiceLine => ({
  description: "Calamari puliti", code: null, quantity: 2, unit: "kg", packQty: null, packUnit: null,
  unitPriceCents: 1100, taxRatePct: 10, lineTotalCents: 2200, kind: "item", ...over,
});
const noLook = async () => new Map<number, string | null>();
const at = new Date("2026-10-01T12:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  db.supplierItem.findMany.mockResolvedValue([]);
  pipeline.loadMatchCandidates.mockResolvedValue([
    { id: "calamari", name: "Calamari puliti", aliases: [] },
    { id: "g1", name: "Gambero rosso Mazara", aliases: [] },
    { id: "g2", name: "Gambero rosso Sicilia", aliases: [] },
  ]);
  db.product.findMany.mockResolvedValue([
    { id: "calamari", precioCompra: 1000, unidadCompra: "kg", precioActualizadoAt: at },
  ]);
});

const propose = (lines: ExtractedInvoiceLine[], supplierId: string | null = null) =>
  proposeInvoiceLines({ restaurantId: "r1", supplierId, invoiceDate: "2026-10-10", lines, secondLook: noLook });

describe("proposeInvoiceLines", () => {
  it("a small price change on an exact match is pre-selected", async () => {
    const [p] = await propose([line({})]);
    expect(p).toMatchObject({ position: 0, productId: "calamari", matchLevel: "exact", action: "update_price", appliedPriceCents: 1100 });
  });

  it("a change of 20% or more waits for the chef", async () => {
    const [p] = await propose([line({ unitPriceCents: 1300, lineTotalCents: 2600 })]);
    expect(p).toMatchObject({ action: null, appliedPriceCents: 1300 });
  });

  it("an ambiguous family waits for the chef", async () => {
    const [p] = await propose([line({ description: "Gambero rosso" })]);
    expect(p).toMatchObject({ productId: null, matchLevel: "ambiguo", action: null });
  });

  it("an unknown product becomes a draft priced in its own unit", async () => {
    const [p] = await propose([line({ description: "Fasolari", unit: "kg", unitPriceCents: 2500, lineTotalCents: 5000 })]);
    expect(p).toMatchObject({ productId: null, matchLevel: "none", action: "create_draft", appliedPriceCents: 2500 });
  });

  it("a deposit charge is ignored and never priced", async () => {
    const [p] = await propose([line({ description: "DIFFERENZA CAUZIONALE", kind: "charge", unit: null })]);
    expect(p).toMatchObject({ matchLevel: "charge", action: "ignore", appliedPriceCents: null });
  });

  it("supplier memory is loaded only for this supplier's live products in this restaurant", async () => {
    await propose([line({})], "s1");
    expect(db.supplierItem.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { supplierId: "s1", product: { restaurantId: "r1", deletedAt: null } },
    }));
    await propose([line({})], null);
    expect(db.supplierItem.findMany).toHaveBeenCalledTimes(1);
  });

  it("a remembered pack prices a box line per kilo", async () => {
    db.supplierItem.findMany.mockResolvedValue([
      { code: null, descriptionNorm: "cozza arborea", productId: "calamari", packQty: { toNumber: () => 5 }, packUnit: "kg" },
    ]);
    const [p] = await propose([line({ description: "COZZA (ARBOREA)", quantity: 1, unit: "CF", unitPriceCents: 5000, lineTotalCents: 5000 })], "s1");
    expect(p).toMatchObject({ productId: "calamari", matchLevel: "memory", packQty: 5, packUnit: "kg", appliedPriceCents: 1000 });
  });
});
