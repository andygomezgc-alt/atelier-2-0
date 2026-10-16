// apps/api/lib/invoices/upload.test.ts
import { describe, expect, it } from "vitest";
import { readUploadedPage } from "./upload";

const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10];
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31];
function form(bytes: number[] | null, type: string, name = "page", size?: number) {
  const f = new FormData();
  if (bytes) {
    const body = size ? new Uint8Array(size).fill(0) : new Uint8Array(bytes);
    if (size) body.set(bytes);
    f.append("file", new File([body], name, { type }));
  }
  return f;
}

describe("readUploadedPage", () => {
  it("accepts a JPEG photo", async () =>
    expect(await readUploadedPage(form(JPEG, "image/jpeg"), { imagesOnly: false })).toMatchObject({ mimeType: "image/jpeg", sizeBytes: 6 }));
  it("infers the type from the name when Android sends none", async () =>
    expect(await readUploadedPage(form(PDF, "", "factura.PDF"), { imagesOnly: false })).toMatchObject({ mimeType: "application/pdf" }));
  it("rejects a missing file", async () =>
    expect(await readUploadedPage(form(null, ""), { imagesOnly: false })).toMatchObject({ status: 400, body: { code: "file_invalid" } }));
  it("rejects a PDF where only photos are allowed", async () =>
    expect(await readUploadedPage(form(PDF, "application/pdf"), { imagesOnly: true })).toMatchObject({ status: 415 }));
  it("rejects bytes that do not match the declared type", async () =>
    expect(await readUploadedPage(form(PDF, "image/jpeg"), { imagesOnly: false })).toMatchObject({ status: 415 }));
  it.each([[JPEG, "image/jpeg"], [PDF, "application/pdf"]])("rejects any file over 4 MB as too large (%#)", async (bytes, type) =>
    expect(await readUploadedPage(form(bytes, type, "big", 4 * 1024 * 1024 + 1), { imagesOnly: false }))
      .toMatchObject({ status: 413, body: { code: "file_too_large" } }));
  it("accepts a file of exactly 4 MB", async () =>
    expect(await readUploadedPage(form(PDF, "application/pdf", "f.pdf", 4 * 1024 * 1024), { imagesOnly: false })).toMatchObject({ mimeType: "application/pdf" }));
});
