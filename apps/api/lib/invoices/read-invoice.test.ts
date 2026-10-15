// apps/api/lib/invoices/read-invoice.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
const { db, tx, quota, storage, extraction, look, propose } = vi.hoisted(() => {
  const tx = { invoice: { updateMany: vi.fn() }, invoiceLine: { deleteMany: vi.fn(), createMany: vi.fn() } };
  return {
    tx,
    db: {
      invoice: { findFirst: vi.fn(), updateMany: vi.fn() },
      supplier: { upsert: vi.fn(), findUnique: vi.fn() },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
    quota: { reserveAiCall: vi.fn(), recordAiTokens: vi.fn() },
    storage: { readInvoiceFile: vi.fn() },
    extraction: { extractInvoicePage: vi.fn() },
    look: { secondLook: vi.fn() },
    propose: { proposeInvoiceLines: vi.fn() },
  };
});
vi.mock("@atelier/db", () => ({ prisma: db }));
vi.mock("../ai-quota", () => quota);
vi.mock("./storage", async (importOriginal) => ({ ...(await importOriginal<typeof import("./storage")>()), ...storage }));
vi.mock("./extraction", async (importOriginal) => ({ ...(await importOriginal<typeof import("./extraction")>()), ...extraction }));
vi.mock("./second-look", () => look);
vi.mock("./propose", () => propose);
vi.mock("../logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
import { InvoiceExtractionError } from "./extraction";
import { InvoiceStorageError } from "./storage";
import { readInvoice, readInvoiceSafely } from "./read-invoice";

const page = (over: Record<string, unknown> = {}) => ({
  isInvoice: true, supplierName: "GARDEN FRUIT s.r.l.", supplierTaxId: "IT01", invoiceNumber: "77", invoiceDate: "2026-10-10",
  netTotalCents: 2200, taxTotalCents: 88, grossTotalCents: 2288, droppedLines: 0,
  lines: [{ description: "Zucchine", code: null, quantity: 2, unit: "kg", packQty: null, packUnit: null, unitPriceCents: 1100, taxRatePct: 4, lineTotalCents: 2200, kind: "item" }],
  ...over,
});
const later = () => Date.now() + 60_000;

beforeEach(() => {
  vi.clearAllMocks();
  db.invoice.findFirst.mockResolvedValue({
    id: "inv1", restaurantId: "r1", uploadedById: "u1", createdAt: new Date("2026-10-11T08:00:00Z"),
    pages: [{ position: 0, storageKey: "k0", mimeType: "image/jpeg" }],
  });
  db.invoice.updateMany.mockResolvedValue({ count: 1 });
  db.supplier.upsert.mockResolvedValue({ id: "s1" });
  quota.reserveAiCall.mockResolvedValue({ ok: true });
  storage.readInvoiceFile.mockResolvedValue(new Uint8Array([1]));
  extraction.extractInvoicePage.mockResolvedValue(page());
  propose.proposeInvoiceLines.mockResolvedValue([{ ...page().lines[0], position: 0, productId: null, matchLevel: "none", action: "create_draft", appliedPriceCents: 1100 }]);
  tx.invoice.updateMany.mockResolvedValue({ count: 1 });
});

const failedWith = (reason: string) =>
  expect(db.invoice.updateMany).toHaveBeenCalledWith({ where: { id: "inv1", status: "reading" }, data: { status: "failed", failureReason: reason } });

describe("readInvoice", () => {
  it("only reads an invoice that is still reading", async () => {
    await readInvoice("inv1", later());
    expect(db.invoice.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "inv1", status: "reading", deletedAt: null } }));
  });

  it("reads, upserts the supplier by normalized name and saves the review", async () => {
    await readInvoice("inv1", later());
    expect(db.supplier.upsert).toHaveBeenCalledWith({
      where: { restaurantId_nameNorm: { restaurantId: "r1", nameNorm: "garden fruit" } },
      create: { restaurantId: "r1", name: "GARDEN FRUIT s.r.l.", nameNorm: "garden fruit", taxId: "IT01" },
      update: { taxId: "IT01" },
      select: { id: true },
    });
    expect(propose.proposeInvoiceLines).toHaveBeenCalledWith(expect.objectContaining({ restaurantId: "r1", supplierId: "s1", invoiceDate: "2026-10-10" }));
    expect(tx.invoice.updateMany).toHaveBeenCalledWith({
      where: { id: "inv1", status: "reading" },
      data: expect.objectContaining({ status: "review", supplierId: "s1", number: "77", issuedOn: new Date("2026-10-10T00:00:00Z"), netTotalCents: 2200, grossTotalCents: 2288 }),
    });
    expect(tx.invoiceLine.deleteMany).toHaveBeenCalledWith({ where: { invoiceId: "inv1" } });
    expect(tx.invoiceLine.createMany.mock.calls[0]![0].data[0]).toMatchObject({ invoiceId: "inv1", position: 0, description: "Zucchine", matchLevel: "none", action: "create_draft", appliedPriceCents: 1100 });
  });

  it("each page reserves one AI call from the uploader", async () => {
    db.invoice.findFirst.mockResolvedValue({ id: "inv1", restaurantId: "r1", uploadedById: "u1", createdAt: new Date(), pages: [
      { position: 0, storageKey: "k0", mimeType: "image/jpeg" }, { position: 1, storageKey: "k1", mimeType: "image/jpeg" },
    ] });
    await readInvoice("inv1", later());
    expect(quota.reserveAiCall).toHaveBeenCalledTimes(2);
    expect(storage.readInvoiceFile.mock.calls.map((c) => c[0])).toEqual(["k0", "k1"]);
  });

  it.each([
    ["the quota is spent", () => quota.reserveAiCall.mockResolvedValue({ ok: false, retryAfter: 60 }), "ai_quota"],
    ["the file is gone", () => storage.readInvoiceFile.mockResolvedValue(null), "file_missing"],
    ["storage is down", () => storage.readInvoiceFile.mockRejectedValue(new InvoiceStorageError("invoice_storage_unavailable")), "storage_unavailable"],
    ["the answer is invalid", () => extraction.extractInvoicePage.mockRejectedValue(new InvoiceExtractionError("invoice_response_invalid")), "unreadable"],
    ["the answer is cut", () => extraction.extractInvoicePage.mockRejectedValue(new Error("invoice_extraction_incomplete")), "unreadable"],
    ["the provider fails", () => extraction.extractInvoicePage.mockRejectedValue(new Error("ai_provider_http_503")), "ai_unavailable"],
    ["it is not an invoice", () => extraction.extractInvoicePage.mockResolvedValue(page({ isInvoice: false })), "not_an_invoice"],
    ["no line was found", () => extraction.extractInvoicePage.mockResolvedValue(page({ lines: [] })), "no_lines"],
  ])("fails with a reason when %s", async (_name, arrange, reason) => {
    arrange();
    await readInvoice("inv1", later());
    failedWith(reason);
    expect(tx.invoice.updateMany).not.toHaveBeenCalled();
  });

  it("stops at its deadline", async () => {
    await readInvoice("inv1", Date.now() - 1);
    failedWith("read_timeout");
    expect(extraction.extractInvoicePage).not.toHaveBeenCalled();
  });

  it("an unreadable supplier name leaves the supplier empty", async () => {
    extraction.extractInvoicePage.mockResolvedValue(page({ supplierName: "  S.r.l. " }));
    await readInvoice("inv1", later());
    expect(db.supplier.upsert).not.toHaveBeenCalled();
    expect(propose.proposeInvoiceLines).toHaveBeenCalledWith(expect.objectContaining({ supplierId: null }));
  });

  it("two reads creating one supplier: the loser reuses the winner's row", async () => {
    db.supplier.upsert.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    db.supplier.findUnique.mockResolvedValue({ id: "s9" });
    await readInvoice("inv1", later());
    expect(propose.proposeInvoiceLines).toHaveBeenCalledWith(expect.objectContaining({ supplierId: "s9" }));
  });

  it("without a printed date the upload day is used for the price rules", async () => {
    extraction.extractInvoicePage.mockResolvedValue(page({ invoiceDate: null }));
    await readInvoice("inv1", later());
    expect(propose.proposeInvoiceLines).toHaveBeenCalledWith(expect.objectContaining({ invoiceDate: "2026-10-11" }));
  });

  it("the second look is skipped when the quota has no call left", async () => {
    quota.reserveAiCall.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false, retryAfter: 60 });
    await readInvoice("inv1", later());
    const { secondLook } = propose.proposeInvoiceLines.mock.calls[0]![0];
    expect(await secondLook([{ position: 0, description: "x", candidates: [] }])).toEqual(new Map());
    expect(look.secondLook).not.toHaveBeenCalled();
  });

  it("a read that lost the race does not overwrite the lines", async () => {
    tx.invoice.updateMany.mockResolvedValue({ count: 0 });
    await readInvoice("inv1", later());
    expect(tx.invoiceLine.deleteMany).not.toHaveBeenCalled();
  });
});

describe("readInvoiceSafely", () => {
  it("never throws and marks the invoice failed", async () => {
    db.invoice.findFirst.mockRejectedValue(new Error("db down"));
    await expect(readInvoiceSafely("inv1")).resolves.toBeUndefined();
    failedWith("internal_error");
  });
});
