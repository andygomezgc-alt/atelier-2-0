// apps/api/lib/invoices/supplier-memory.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
const { db, log } = vi.hoisted(() => ({
  db: { supplierItem: { findUnique: vi.fn(), update: vi.fn(), upsert: vi.fn() } },
  log: { warn: vi.fn() },
}));
vi.mock("@atelier/db", () => ({ prisma: db }));
vi.mock("../logger", () => ({ logger: log }));
import { rememberSupplierItems } from "./supplier-memory";

const entry = { code: " cc3ppu ", description: "CALAMARI 3P PULITI", productId: "p1", packQty: null, packUnit: null, priceCents: 1100 };
beforeEach(() => { vi.clearAllMocks(); db.supplierItem.findUnique.mockResolvedValue(null); });

describe("rememberSupplierItems", () => {
  it("stores normalized code and description", async () => {
    await rememberSupplierItems("s1", [entry]);
    expect(db.supplierItem.upsert).toHaveBeenCalledWith({
      where: { supplierId_descriptionNorm: { supplierId: "s1", descriptionNorm: "calamari 3p puliti" } },
      create: { supplierId: "s1", code: "CC3PPU", descriptionNorm: "calamari 3p puliti", productId: "p1", packQty: null, packUnit: null, lastPriceCents: 1100 },
      update: { code: "CC3PPU", productId: "p1", packQty: null, packUnit: null, lastPriceCents: 1100 },
    });
  });

  it("an empty code is stored as null, never as an empty string", async () => {
    await rememberSupplierItems("s1", [{ ...entry, code: "  " }]);
    expect(db.supplierItem.findUnique).not.toHaveBeenCalled();
    expect(db.supplierItem.upsert.mock.calls[0]![0].create.code).toBeNull();
    expect(db.supplierItem.upsert.mock.calls[0]![0].update).not.toHaveProperty("code");
  });

  it("a known code updates that entry even when the description changed", async () => {
    db.supplierItem.findUnique.mockResolvedValue({ id: "si1" });
    await rememberSupplierItems("s1", [entry]);
    expect(db.supplierItem.update).toHaveBeenCalledWith({ where: { id: "si1" }, data: { productId: "p1", packQty: null, packUnit: null, lastPriceCents: 1100 } });
    expect(db.supplierItem.upsert).not.toHaveBeenCalled();
  });

  it("a unique clash from a concurrent apply is logged and the rest continue", async () => {
    db.supplierItem.upsert.mockRejectedValueOnce(Object.assign(new Error("unique"), { code: "P2002" }));
    await expect(rememberSupplierItems("s1", [entry, { ...entry, code: null, description: "COZZE" }])).resolves.toBeUndefined();
    expect(db.supplierItem.upsert).toHaveBeenCalledTimes(2);
    expect(log.warn).toHaveBeenCalledWith("invoice_memory_failed", expect.objectContaining({ code: "P2002" }));
  });
});
