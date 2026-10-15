// apps/api/app/api/invoices/__tests__/header-patch.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { db, guard } = vi.hoisted(() => ({
  db: {
    invoice: { findFirst: vi.fn(), updateMany: vi.fn() },
    supplier: { findFirst: vi.fn(), upsert: vi.fn(), findUnique: vi.fn() },
  },
  guard: { requireAuth: vi.fn() },
}));
vi.mock("@atelier/db", () => ({ prisma: db }));
vi.mock("@/lib/permissions-guard", () => ({ requireAuth: guard.requireAuth, isNextResponse: (v: unknown) => v instanceof Response }));
vi.mock("@/lib/recipes/extraction-pipeline", () => ({ loadMatchCandidates: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
import { PATCH } from "../[id]/route";

const NOW = new Date("2026-10-15T09:00:00Z");
const patch = (body: unknown, id = "inv1") =>
  PATCH(new NextRequest(`https://t.local/api/invoices/${id}`, { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
const written = () => db.invoice.updateMany.mock.calls[0]![0];

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  guard.requireAuth.mockResolvedValue({ userId: "u1", role: "sous_chef", restaurantId: "r1" });
  db.invoice.findFirst.mockResolvedValue({ status: "review" });
  db.invoice.updateMany.mockResolvedValue({ count: 1 });
  db.supplier.findFirst.mockResolvedValue({ id: "s2" });
  db.supplier.upsert.mockResolvedValue({ id: "s9" });
});
afterEach(() => vi.useRealTimers());

describe("PATCH /api/invoices/[id]", () => {
  it("picks an existing supplier of this restaurant, fenced on review", async () => {
    const res = await patch({ supplierId: "s2" });
    expect(res.status).toBe(200);
    expect(db.supplier.findFirst).toHaveBeenCalledWith({ where: { id: "s2", restaurantId: "r1" }, select: { id: true } });
    expect(written()).toEqual({ where: { id: "inv1", restaurantId: "r1", deletedAt: null, status: "review" }, data: { supplierId: "s2" } });
  });

  it("a typed supplier name is created on first use and reused after", async () => {
    await patch({ supplierName: "  GARDEN FRUIT s.r.l. " });
    expect(db.supplier.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { restaurantId_nameNorm: { restaurantId: "r1", nameNorm: "garden fruit" } },
    }));
    expect(written().data).toEqual({ supplierId: "s9" });
  });

  it("corrects the number and the date, and can clear both", async () => {
    await patch({ number: " 77/B ", issuedOn: "2026-10-10" });
    expect(written().data).toEqual({ number: "77/B", issuedOn: new Date("2026-10-10T00:00:00Z") });
    await patch({ number: "", issuedOn: null });
    expect(db.invoice.updateMany.mock.calls[1]![0].data).toEqual({ number: null, issuedOn: null });
  });

  it.each([["2026-02-31"], ["2026-10-18"], ["15/10/2026"]])("refuses the impossible or future date %s", async (issuedOn) => {
    const res = await patch({ issuedOn });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "invalid_body" });
    expect(db.invoice.updateMany).not.toHaveBeenCalled();
  });

  it("refuses both supplier fields at once, and a name that is only a company form", async () => {
    expect((await patch({ supplierId: "s2", supplierName: "Recchioni" })).status).toBe(400);
    expect((await patch({ supplierName: "S.r.l." })).status).toBe(400);
    expect(db.invoice.updateMany).not.toHaveBeenCalled();
  });

  it("a supplier of another restaurant is not found", async () => {
    db.supplier.findFirst.mockResolvedValue(null);
    const res = await patch({ supplierId: "other" });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "supplier_not_found" });
  });

  it("only an invoice in review changes", async () => {
    db.invoice.findFirst.mockResolvedValueOnce(null);
    expect((await patch({ number: "1" })).status).toBe(404);
    db.invoice.findFirst.mockResolvedValueOnce({ status: "applied" });
    expect(await (await patch({ number: "1" })).json()).toMatchObject({ code: "invoice_not_in_review" });
    db.invoice.updateMany.mockResolvedValueOnce({ count: 0 });
    expect((await patch({ number: "1" })).status).toBe(409);
  });
});
