import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ getToken: vi.fn(), upload: vi.fn(), fetch: vi.fn() }));

vi.mock("@/src/lib/secure-storage", () => ({ getItemAsync: h.getToken }));
vi.mock("expo-file-system/legacy", () => ({ uploadAsync: h.upload, FileSystemUploadType: { MULTIPART: 1 } }));
vi.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "es", languageTag: "es-ES" }] }));
vi.mock("../client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../client")>()), apiFetch: h.fetch }));

import { chooseProduct, invoicePageSource, startInvoice } from "../invoices";
import { ApiError, NetworkError } from "../client";
import { apiErrorMessage } from "@/src/lib/api-error";

const t = (key: string) => `t:${key}`;

beforeEach(() => {
  vi.resetAllMocks();
  h.getToken.mockResolvedValue("session-token");
});

describe("invoice uploads", () => {
  it("sends the first page as multipart with the session token", async () => {
    h.upload.mockResolvedValue({ status: 201, body: '{"id":"inv1","pages":1}' });
    expect(await startInvoice("file:///p1.jpg", "image/jpeg")).toEqual({ id: "inv1", pages: 1 });
    expect(h.upload).toHaveBeenCalledWith(expect.stringMatching(/\/api\/invoices$/), "file:///p1.jpg", {
      httpMethod: "POST", uploadType: 1, fieldName: "file", mimeType: "image/jpeg", headers: { Authorization: "Bearer session-token" },
    });
  });

  it("a file the server finds too large is explained, not shown raw", async () => {
    h.upload.mockResolvedValue({ status: 413, body: '{"error":"File too large","code":"file_too_large"}' });
    const error = await startInvoice("file:///big.pdf", "application/pdf").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(apiErrorMessage(error, t)).toBe("t:invoice_file_too_large");
  });

  it("no connection is a network error", async () => {
    h.upload.mockRejectedValue(new Error("Network request failed"));
    await expect(startInvoice("file:///p1.jpg", "image/jpeg")).rejects.toBeInstanceOf(NetworkError);
  });
});

describe("chooseProduct", () => {
  it("updates the price when the line's price fits the product", async () => {
    h.fetch.mockResolvedValue({ position: 2, action: "update_price" });
    await chooseProduct("inv1", 2, "p9");
    expect(h.fetch).toHaveBeenCalledWith("/api/invoices/inv1/lines/2", { method: "PATCH", body: JSON.stringify({ action: "update_price", productId: "p9" }) });
  });

  it("falls back to linking when no price fits the product's unit", async () => {
    h.fetch.mockRejectedValueOnce(new ApiError(400, "Enter a price", "price_required")).mockResolvedValueOnce({ position: 2, action: "connect" });
    expect(await chooseProduct("inv1", 2, "p9")).toMatchObject({ action: "connect" });
    expect(h.fetch).toHaveBeenLastCalledWith("/api/invoices/inv1/lines/2", { method: "PATCH", body: JSON.stringify({ action: "connect", productId: "p9" }) });
  });

  it("any other refusal reaches the screen", async () => {
    h.fetch.mockRejectedValue(new ApiError(409, "The invoice is not in review", "invoice_not_in_review"));
    await expect(chooseProduct("inv1", 2, "p9")).rejects.toMatchObject({ code: "invoice_not_in_review" });
    expect(h.fetch).toHaveBeenCalledTimes(1);
  });
});

it("an original page is loaded with the session token", async () => {
  expect(await invoicePageSource("inv1", 1)).toEqual({
    uri: expect.stringMatching(/\/api\/invoices\/inv1\/pages\/1$/), headers: { Authorization: "Bearer session-token" },
  });
});
