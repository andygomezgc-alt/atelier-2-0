// apps/api/app/api/invoices/__tests__/read-routes.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { db, guard, storage, reader, pipeline, after } = vi.hoisted(() => ({
  db: {
    invoice: { findMany: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
    invoicePage: { findFirst: vi.fn() },
  },
  guard: { requireAuth: vi.fn() },
  storage: { openInvoiceFile: vi.fn() },
  reader: { readInvoiceSafely: vi.fn() },
  pipeline: { loadMatchCandidates: vi.fn() },
  after: vi.fn(),
}));
vi.mock("@atelier/db", () => ({ prisma: db }));
vi.mock("@/lib/permissions-guard", () => ({ requireAuth: guard.requireAuth, isNextResponse: (v: unknown) => v instanceof Response }));
vi.mock("@/lib/invoices/storage", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/invoices/storage")>()), ...storage }));
vi.mock("@/lib/invoices/read-invoice", () => reader);
vi.mock("@/lib/recipes/extraction-pipeline", () => pipeline);
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), after }));

import { InvoiceStorageError } from "@/lib/invoices/storage";
import { GET as list } from "../route";
import { GET as detail, DELETE as remove } from "../[id]/route";
import { GET as pageFile } from "../[id]/pages/[position]/route";
import { POST as retry } from "../[id]/retry/route";

const CTX = { userId: "u1", role: "sous_chef", restaurantId: "r1" };
const req = (url = "https://t.local/api/invoices") => new NextRequest(url);
const params = <T extends object>(p: T) => ({ params: Promise.resolve(p) });
const row = (over: Record<string, unknown>) => ({
  id: "i", status: "review", number: "1", issuedOn: new Date("2026-10-10T00:00:00Z"), grossTotalCents: 100, netTotalCents: 90,
  failureReason: null, createdAt: new Date("2026-10-11T08:00:00Z"), supplier: { id: "s1", name: "Recchioni" }, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  guard.requireAuth.mockResolvedValue(CTX);
  db.invoice.updateMany.mockResolvedValue({ count: 0 });
  pipeline.loadMatchCandidates.mockResolvedValue([]);
});

describe("GET /api/invoices", () => {
  it("expires stuck reads of this restaurant first", async () => {
    db.invoice.findMany.mockResolvedValue([]);
    await list(req());
    expect(db.invoice.updateMany).toHaveBeenCalledWith({
      where: { restaurantId: "r1", status: "reading", updatedAt: { lt: expect.any(Date) } },
      data: { status: "failed", failureReason: "read_timeout" },
    });
  });

  it("groups by supplier, newest first, hides uploads and counts what needs review", async () => {
    db.invoice.findMany.mockResolvedValue([
      row({ id: "a", issuedOn: new Date("2026-10-01T00:00:00Z") }),
      row({ id: "b", supplier: { id: "s2", name: "MARR" }, issuedOn: new Date("2026-10-12T00:00:00Z"), status: "applied" }),
      row({ id: "c", issuedOn: null, createdAt: new Date("2026-10-13T08:00:00Z") }),
    ]);
    const body = await (await list(req())).json();
    expect(db.invoice.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { restaurantId: "r1", deletedAt: null, status: { not: "uploading" } },
    }));
    expect(body.toReview).toBe(2);
    expect(body.suppliers.map((g: { supplier: { name: string } }) => g.supplier.name)).toEqual(["Recchioni", "MARR"]);
    expect(body.suppliers[0].invoices.map((i: { id: string }) => i.id)).toEqual(["c", "a"]);
    expect(body.suppliers[0].invoices[1]).toMatchObject({ issuedOn: "2026-10-01" });
  });
});

describe("GET /api/invoices/[id]", () => {
  const invoice = (lines: unknown[]) => ({
    ...row({ id: "inv1" }), supplierId: "s1", taxTotalCents: 10,
    pages: [{ position: 0, mimeType: "image/jpeg" }], lines,
  });
  const dbLine = (over: Record<string, unknown>) => ({
    position: 0, description: "Calamari", code: null, quantity: { toNumber: () => 2 }, unit: "kg", packQty: null, packUnit: null,
    unitPriceCents: 45, taxRatePct: { toNumber: () => 10 }, lineTotalCents: 90, matchLevel: "exact", action: "update_price",
    appliedPriceCents: 45, product: { id: "p1", name: "Calamari", unidadCompra: "kg", precioCompra: 40, taxRatePct: { toNumber: () => 10 } },
    draftName: null, draftCategory: null, draftMermaPct: null, draftMermaReason: null, ...over,
  });

  it("is scoped to the restaurant and never exposes storage keys", async () => {
    db.invoice.findFirst.mockResolvedValueOnce(invoice([dbLine({})])).mockResolvedValueOnce(null);
    const body = await (await detail(req(), params({ id: "inv1" }))).json();
    expect(db.invoice.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "inv1", restaurantId: "r1", deletedAt: null } }));
    expect(JSON.stringify(body)).not.toContain("storageKey");
    expect(body.lines[0]).toMatchObject({ quantity: 2, taxRatePct: 10, product: { taxRatePct: 10 }, quantityLooksMisread: false });
    expect(body.checks).toEqual({ totals: { status: "ok", sumCents: 90, diffCents: 0 }, duplicateOf: null });
  });

  it("flags a second invoice with the same supplier and number", async () => {
    db.invoice.findFirst.mockResolvedValueOnce(invoice([dbLine({})])).mockResolvedValueOnce({ id: "older" });
    const body = await (await detail(req(), params({ id: "inv1" }))).json();
    expect(db.invoice.findFirst).toHaveBeenLastCalledWith({
      where: { id: { not: "inv1" }, restaurantId: "r1", supplierId: "s1", number: "1", deletedAt: null },
      select: { id: true }, orderBy: { createdAt: "asc" },
    });
    expect(body.checks.duplicateOf).toBe("older");
  });

  it("offers the sibling products for an ambiguous line", async () => {
    pipeline.loadMatchCandidates.mockResolvedValue([
      { id: "g1", name: "Gambero rosso Mazara", aliases: [] }, { id: "g2", name: "Gambero rosso Sicilia", aliases: [] },
    ]);
    db.invoice.findFirst.mockResolvedValueOnce(invoice([dbLine({ description: "Gambero rosso", matchLevel: "ambiguo", action: null, product: null })])).mockResolvedValueOnce(null);
    const body = await (await detail(req(), params({ id: "inv1" }))).json();
    expect(body.lines[0].siblings.map((s: { id: string }) => s.id)).toEqual(["g1", "g2"]);
  });

  it("shows the AI's proposal for a line that becomes a new product", async () => {
    db.invoice.findFirst.mockResolvedValueOnce(invoice([
      dbLine({ description: "FASOLARO COD 9", action: "create_draft", product: null, draftName: "Fasolari", draftCategory: "pescado", draftMermaPct: { toNumber: () => 30 }, draftMermaReason: "guscio" }),
      dbLine({ position: 1 }),
    ])).mockResolvedValueOnce(null);
    const body = await (await detail(req(), params({ id: "inv1" }))).json();
    expect(body.lines[0].draft).toEqual({ name: "Fasolari", category: "pescado", mermaPct: 30, mermaReason: "guscio" });
    expect(body.lines[1].draft).toBeNull();
  });

  it("another restaurant's invoice is not found", async () => {
    db.invoice.findFirst.mockResolvedValue(null);
    expect((await detail(req(), params({ id: "inv1" }))).status).toBe(404);
  });
});

describe("GET /api/invoices/[id]/pages/[position]", () => {
  it("streams the file privately", async () => {
    db.invoicePage.findFirst.mockResolvedValue({ storageKey: "invoices/r1/inv1/a.jpg" });
    storage.openInvoiceFile.mockResolvedValue({ stream: new Response("img").body, contentType: "image/jpeg" });
    const res = await pageFile(req(), params({ id: "inv1", position: "0" }));
    expect(db.invoicePage.findFirst).toHaveBeenCalledWith({
      where: { position: 0, invoice: { id: "inv1", restaurantId: "r1", deletedAt: null } }, select: { storageKey: true },
    });
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
    expect(await res.text()).toBe("img");
  });

  it.each([["x"], ["-1"], ["1.5"]])("rejects position %j", async (position) => {
    expect((await pageFile(req(), params({ id: "inv1", position }))).status).toBe(404);
    expect(db.invoicePage.findFirst).not.toHaveBeenCalled();
  });

  it("a storage outage is 503, not a crash", async () => {
    db.invoicePage.findFirst.mockResolvedValue({ storageKey: "k" });
    storage.openInvoiceFile.mockRejectedValue(new InvoiceStorageError("invoice_storage_unavailable"));
    const res = await pageFile(req(), params({ id: "inv1", position: "0" }));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: "invoice_storage_unavailable" });
  });

  it("a file gone from storage is 404", async () => {
    db.invoicePage.findFirst.mockResolvedValue({ storageKey: "k" });
    storage.openInvoiceFile.mockResolvedValue(null);
    expect((await pageFile(req(), params({ id: "inv1", position: "0" }))).status).toBe(404);
  });
});

describe("POST /api/invoices/[id]/retry", () => {
  it("only a failed invoice is read again", async () => {
    db.invoice.updateMany.mockResolvedValue({ count: 1 });
    const res = await retry(new NextRequest("https://t.local/x", { method: "POST" }), params({ id: "inv1" }));
    expect(res.status).toBe(202);
    expect(db.invoice.updateMany).toHaveBeenCalledWith({
      where: { id: "inv1", restaurantId: "r1", deletedAt: null, status: "failed" },
      data: { status: "reading", failureReason: null },
    });
    await after.mock.calls[0]![0]();
    expect(reader.readInvoiceSafely).toHaveBeenCalledWith("inv1");
  });

  it("anything else is a conflict", async () => {
    db.invoice.updateMany.mockResolvedValue({ count: 0 });
    expect((await retry(new NextRequest("https://t.local/x", { method: "POST" }), params({ id: "inv1" }))).status).toBe(409);
    expect(after).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/invoices/[id]", () => {
  it("moves the invoice to the trash", async () => {
    db.invoice.updateMany.mockResolvedValue({ count: 1 });
    expect((await remove(req(), params({ id: "inv1" }))).status).toBe(200);
    expect(db.invoice.updateMany).toHaveBeenCalledWith({
      where: { id: "inv1", restaurantId: "r1", deletedAt: null }, data: { deletedAt: expect.any(Date) },
    });
  });

  it("an unknown invoice is 404", async () => {
    db.invoice.updateMany.mockResolvedValue({ count: 0 });
    expect((await remove(req(), params({ id: "inv1" }))).status).toBe(404);
  });
});
