// apps/api/lib/invoices/purge.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
const { db, tx, storage } = vi.hoisted(() => {
  const tx = { invoicePage: { findMany: vi.fn() }, invoice: { deleteMany: vi.fn() } };
  return {
    tx,
    db: { invoice: { findMany: vi.fn() }, $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) },
    storage: { deleteInvoiceFiles: vi.fn() },
  };
});
vi.mock("@atelier/db", () => ({ prisma: db }));
vi.mock("./storage", () => storage);
vi.mock("../logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
import { purgeExpiredInvoices } from "./purge";

const now = new Date("2026-10-15T03:30:00Z");
const expired = {
  OR: [
    { deletedAt: { lt: new Date("2026-10-08T03:30:00Z") } },
    { status: "uploading", deletedAt: null, createdAt: { lt: new Date("2026-10-14T03:30:00Z") } },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  tx.invoicePage.findMany.mockResolvedValue([{ storageKey: "k1" }, { storageKey: "k2" }]);
  tx.invoice.deleteMany.mockResolvedValue({ count: 2 });
});

describe("purgeExpiredInvoices", () => {
  it("deletes trashed and abandoned invoices, then their files", async () => {
    db.invoice.findMany.mockResolvedValueOnce([{ id: "a" }, { id: "b" }]);
    expect(await purgeExpiredInvoices(now, { batchSize: 10 })).toEqual({ invoices: 2, files: 2, failed: 0, complete: true });
    expect(db.invoice.findMany).toHaveBeenCalledWith({ where: expired, select: { id: true }, orderBy: { createdAt: "asc" }, take: 10 });
    expect(tx.invoicePage.findMany).toHaveBeenCalledWith({ where: { invoice: { id: { in: ["a", "b"] }, ...expired } }, select: { storageKey: true } });
    expect(tx.invoice.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["a", "b"] }, ...expired } });
    expect(storage.deleteInvoiceFiles).toHaveBeenCalledWith(["k1", "k2"]);
  });

  it("files are not touched when the delete fails, and the batch is skipped", async () => {
    db.invoice.findMany.mockResolvedValueOnce([{ id: "a" }]).mockResolvedValueOnce([]);
    tx.invoice.deleteMany.mockRejectedValue(new Error("fk"));
    expect(await purgeExpiredInvoices(now, { batchSize: 1 })).toMatchObject({ invoices: 0, failed: 1 });
    expect(storage.deleteInvoiceFiles).not.toHaveBeenCalled();
    expect(db.invoice.findMany.mock.calls[1]![0].where).toEqual({ ...expired, id: { notIn: ["a"] } });
  });

  it("stops when out of time", async () => {
    expect(await purgeExpiredInvoices(now, { budgetMs: -1 })).toMatchObject({ complete: false, invoices: 0 });
    expect(db.invoice.findMany).not.toHaveBeenCalled();
  });
});
