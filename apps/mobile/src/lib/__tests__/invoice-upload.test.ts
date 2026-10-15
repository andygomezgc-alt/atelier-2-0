import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ start: vi.fn(), add: vi.fn(), read: vi.fn(), remove: vi.fn(), calls: [] as string[] }));
vi.mock("@/src/api/invoices", () => ({
  startInvoice: h.start, addInvoicePage: h.add, startInvoiceRead: h.read, deleteInvoice: h.remove,
}));

import { invoiceBatches, sendInvoice, sendInvoices } from "../invoice-upload";

const jpg = (n: number) => ({ uri: `file:///p${n}.jpg`, mimeType: "image/jpeg" });
const pdf = (n: number) => ({ uri: `file:///f${n}.pdf`, mimeType: "application/pdf" });

beforeEach(() => {
  vi.resetAllMocks();
  h.calls = [];
  let n = 0;
  h.start.mockImplementation(async (uri: string) => { h.calls.push(`start ${uri}`); return { id: `inv${++n}`, pages: 1 }; });
  h.add.mockImplementation(async (id: string, uri: string) => { h.calls.push(`add ${id} ${uri}`); return { position: 1 }; });
  h.read.mockImplementation(async (id: string) => { h.calls.push(`read ${id}`); });
  h.remove.mockResolvedValue({ ok: true });
});

describe("sendInvoice", () => {
  it("sends the pages in order, then starts the read", async () => {
    expect(await sendInvoice([jpg(1), jpg(2), jpg(3)])).toBe("inv1");
    expect(h.calls).toEqual(["start file:///p1.jpg", "add inv1 file:///p2.jpg", "add inv1 file:///p3.jpg", "read inv1"]);
  });

  it("a page that fails to upload deletes the half-sent invoice", async () => {
    h.add.mockRejectedValueOnce(new Error("Network request failed"));
    await expect(sendInvoice([jpg(1), jpg(2)])).rejects.toThrow("Network request failed");
    expect(h.remove).toHaveBeenCalledWith("inv1");
    expect(h.read).not.toHaveBeenCalled();
  });

  it("a failed clean-up never hides the real error", async () => {
    h.read.mockRejectedValueOnce(new Error("offline"));
    h.remove.mockRejectedValueOnce(new Error("still offline"));
    await expect(sendInvoice([jpg(1)])).rejects.toThrow("offline");
  });
});

it("photos are the pages of one invoice; each PDF is its own invoice", () => {
  expect(invoiceBatches([jpg(1), jpg(2)], [pdf(1), pdf(2)])).toEqual([[jpg(1), jpg(2)], [pdf(1)], [pdf(2)]]);
  expect(invoiceBatches([], [pdf(1)])).toEqual([[pdf(1)]]);
});

it("sendInvoices keeps going after a failure and says what did not go", async () => {
  h.start.mockImplementationOnce(async () => ({ id: "inv1", pages: 1 })).mockRejectedValueOnce(new Error("offline"));
  const result = await sendInvoices([[jpg(1)], [pdf(1)]]);
  expect(result.ids).toEqual(["inv1"]);
  expect(result.failed).toEqual([[pdf(1)]]);
  expect(result.error).toBeInstanceOf(Error);
});
