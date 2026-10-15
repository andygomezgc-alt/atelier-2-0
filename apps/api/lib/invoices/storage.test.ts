// apps/api/lib/invoices/storage.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { blob } = vi.hoisted(() => ({ blob: { put: vi.fn(), get: vi.fn(), del: vi.fn() } }));
vi.mock("@vercel/blob", () => blob);
vi.mock("../logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));
import { deleteInvoiceFiles, readInvoiceFile, storeInvoiceFile } from "./storage";

beforeEach(() => {
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "shared");
  vi.stubEnv("INVOICE_BLOB_READ_WRITE_TOKEN", "");
  blob.put.mockReset().mockImplementation(async (pathname: string) => ({ pathname }));
  blob.get.mockReset();
  blob.del.mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("invoice storage", () => {
  it("stores privately under the restaurant and invoice and returns the key", async () => {
    const key = await storeInvoiceFile("r1", "inv1", new Uint8Array([1, 2]), "application/pdf");
    expect(key).toMatch(/^invoices\/r1\/inv1\/[0-9a-f-]{36}\.pdf$/);
    expect(blob.put).toHaveBeenCalledWith(key, expect.any(Buffer), expect.objectContaining({ access: "private", contentType: "application/pdf", token: "shared" }));
  });

  it("prefers the dedicated invoice store token", async () => {
    vi.stubEnv("INVOICE_BLOB_READ_WRITE_TOKEN", "invoices-only");
    await storeInvoiceFile("r1", "inv1", new Uint8Array([1]), "image/jpeg");
    expect(blob.put.mock.calls[0]![2]).toMatchObject({ token: "invoices-only" });
  });

  it("fails clearly without any token", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    await expect(storeInvoiceFile("r1", "inv1", new Uint8Array([1]), "image/jpeg")).rejects.toThrow("invoice_storage_unconfigured");
  });

  it("a storage outage becomes invoice_storage_unavailable", async () => {
    blob.put.mockRejectedValue(new Error("503"));
    await expect(storeInvoiceFile("r1", "inv1", new Uint8Array([1]), "image/jpeg")).rejects.toThrow("invoice_storage_unavailable");
  });

  it("reads the bytes back, and null when the file is gone", async () => {
    blob.get.mockResolvedValueOnce({ statusCode: 200, stream: new Response(new Uint8Array([7, 8])).body, blob: { contentType: "image/jpeg" } });
    expect(await readInvoiceFile("invoices/r1/inv1/a.jpg")).toEqual(new Uint8Array([7, 8]));
    blob.get.mockResolvedValueOnce(null);
    expect(await readInvoiceFile("invoices/r1/inv1/b.jpg")).toBeNull();
    expect(blob.get).toHaveBeenCalledWith("invoices/r1/inv1/a.jpg", expect.objectContaining({ access: "private" }));
  });

  it("deleting never throws", async () => {
    blob.del.mockRejectedValue(new Error("down"));
    await expect(deleteInvoiceFiles(["invoices/r1/inv1/a.jpg"])).resolves.toBeUndefined();
    await deleteInvoiceFiles([]);
    expect(blob.del).toHaveBeenCalledTimes(1);
  });
});
