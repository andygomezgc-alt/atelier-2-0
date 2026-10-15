// apps/api/app/api/invoices/__tests__/upload.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { db, guard, storage, reader, after } = vi.hoisted(() => ({
  db: {
    invoice: { create: vi.fn(), delete: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
    invoicePage: { create: vi.fn() },
  },
  guard: { requireAuth: vi.fn() },
  storage: { storeInvoiceFile: vi.fn(), deleteInvoiceFiles: vi.fn() },
  reader: { readInvoiceSafely: vi.fn() },
  after: vi.fn(),
}));
vi.mock("@atelier/db", () => ({ prisma: db }));
vi.mock("@/lib/permissions-guard", () => ({ requireAuth: guard.requireAuth, isNextResponse: (v: unknown) => v instanceof Response }));
vi.mock("@/lib/invoices/storage", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/invoices/storage")>()), ...storage }));
vi.mock("@/lib/invoices/read-invoice", () => reader);
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), after }));

import { InvoiceStorageError } from "@/lib/invoices/storage";
import { POST as create } from "../route";
import { POST as addPage } from "../[id]/pages/route";
import { POST as startRead } from "../[id]/read/route";

const CTX = { userId: "u1", role: "chef_executive", restaurantId: "r1" };
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10];
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31];
const params = (id = "inv1") => ({ params: Promise.resolve({ id }) });
function multipart(url: string, bytes: number[], type: string) {
  const form = new FormData();
  form.append("file", new File([new Uint8Array(bytes)], "page", { type }));
  return new NextRequest(url, { method: "POST", body: form });
}

beforeEach(() => {
  vi.clearAllMocks();
  guard.requireAuth.mockResolvedValue(CTX);
  db.invoice.create.mockResolvedValue({ id: "inv1" });
  storage.storeInvoiceFile.mockResolvedValue("invoices/r1/inv1/a.jpg");
});

describe("POST /api/invoices", () => {
  it("needs manage_products", async () => {
    guard.requireAuth.mockResolvedValue(Response.json({}, { status: 403 }));
    expect((await create(multipart("https://t.local/api/invoices", JPEG, "image/jpeg"))).status).toBe(403);
    expect(guard.requireAuth).toHaveBeenCalledWith(expect.anything(), "manage_products");
  });

  it("creates an uploading invoice with its first page", async () => {
    const res = await create(multipart("https://t.local/api/invoices", JPEG, "image/jpeg"));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "inv1", pages: 1 });
    expect(db.invoice.create).toHaveBeenCalledWith({ data: { restaurantId: "r1", uploadedById: "u1", status: "uploading" }, select: { id: true } });
    expect(storage.storeInvoiceFile).toHaveBeenCalledWith("r1", "inv1", expect.any(Uint8Array), "image/jpeg");
    expect(db.invoicePage.create).toHaveBeenCalledWith({ data: { invoiceId: "inv1", position: 0, storageKey: "invoices/r1/inv1/a.jpg", mimeType: "image/jpeg", sizeBytes: 6 } });
  });

  it("a storage outage leaves no invoice behind", async () => {
    storage.storeInvoiceFile.mockRejectedValue(new InvoiceStorageError("invoice_storage_unavailable"));
    const res = await create(multipart("https://t.local/api/invoices", JPEG, "image/jpeg"));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: "invoice_storage_unavailable" });
    expect(db.invoice.delete).toHaveBeenCalledWith({ where: { id: "inv1" } });
  });

  it("rejects a bad file before creating anything", async () => {
    const res = await create(multipart("https://t.local/api/invoices", PDF, "image/jpeg"));
    expect(res.status).toBe(415);
    expect(db.invoice.create).not.toHaveBeenCalled();
  });
});

describe("POST /api/invoices/[id]/pages", () => {
  const uploading = (pages: Array<{ mimeType: string }>) =>
    db.invoice.findFirst.mockResolvedValue({ id: "inv1", status: "uploading", pages });

  it("adds the next photo at the next position", async () => {
    uploading([{ mimeType: "image/jpeg" }]);
    const res = await addPage(multipart("https://t.local/api/invoices/inv1/pages", JPEG, "image/jpeg"), params());
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ position: 1 });
    expect(db.invoice.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "inv1", restaurantId: "r1", deletedAt: null } }));
  });

  it("another restaurant's invoice is not found", async () => {
    db.invoice.findFirst.mockResolvedValue(null);
    expect((await addPage(multipart("https://t.local/x", JPEG, "image/jpeg"), params())).status).toBe(404);
  });

  it("refuses pages once reading started", async () => {
    db.invoice.findFirst.mockResolvedValue({ id: "inv1", status: "reading", pages: [{ mimeType: "image/jpeg" }] });
    expect(await (await addPage(multipart("https://t.local/x", JPEG, "image/jpeg"), params())).json()).toMatchObject({ code: "invoice_not_uploading" });
  });

  it("nothing is added after a PDF", async () => {
    uploading([{ mimeType: "application/pdf" }]);
    expect(await (await addPage(multipart("https://t.local/x", JPEG, "image/jpeg"), params())).json()).toMatchObject({ code: "invoice_pdf_single_file" });
  });

  it("stops at 10 pages", async () => {
    uploading(Array.from({ length: 10 }, () => ({ mimeType: "image/jpeg" })));
    expect(await (await addPage(multipart("https://t.local/x", JPEG, "image/jpeg"), params())).json()).toMatchObject({ code: "invoice_too_many_pages" });
  });

  it("two pages racing for one position: the loser gets 409 and its file is removed", async () => {
    uploading([{ mimeType: "image/jpeg" }]);
    db.invoicePage.create.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    const res = await addPage(multipart("https://t.local/x", JPEG, "image/jpeg"), params());
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "invoice_page_conflict" });
    expect(storage.deleteInvoiceFiles).toHaveBeenCalledWith(["invoices/r1/inv1/a.jpg"]);
  });
});

describe("POST /api/invoices/[id]/read", () => {
  it("claims the upload and reads it in the background", async () => {
    db.invoice.updateMany.mockResolvedValue({ count: 1 });
    const res = await startRead(new NextRequest("https://t.local/x", { method: "POST" }), params());
    expect(res.status).toBe(202);
    expect(db.invoice.updateMany).toHaveBeenCalledWith({
      where: { id: "inv1", restaurantId: "r1", deletedAt: null, status: "uploading" },
      data: { status: "reading", failureReason: null },
    });
    expect(after).toHaveBeenCalledTimes(1);
    await after.mock.calls[0]![0]();
    expect(reader.readInvoiceSafely).toHaveBeenCalledWith("inv1");
  });

  it("a second tap does not start a second read", async () => {
    db.invoice.updateMany.mockResolvedValue({ count: 0 });
    db.invoice.findFirst.mockResolvedValue({ status: "reading" });
    const res = await startRead(new NextRequest("https://t.local/x", { method: "POST" }), params());
    expect(res.status).toBe(409);
    expect(after).not.toHaveBeenCalled();
  });
});
