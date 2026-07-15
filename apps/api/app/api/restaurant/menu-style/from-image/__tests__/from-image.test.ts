import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { db, guard, extract, blob, quota, pdf } = vi.hoisted(() => ({
  db: { restaurant: { update: vi.fn() } },
  guard: {
    requireAuth: vi.fn(),
    isNextResponse: (v: unknown) =>
      typeof v === "object" && v !== null && "status" in v && "headers" in v,
  },
  extract: { extractMenuStyle: vi.fn() },
  blob: { uploadPhoto: vi.fn() },
  quota: { reserveAiCall: vi.fn() },
  pdf: { getDocumentProxy: vi.fn() },
}));

vi.mock("@atelier/db", () => ({ prisma: db }));
vi.mock("@/lib/permissions-guard", () => ({
  requireAuth: guard.requireAuth,
  isNextResponse: guard.isNextResponse,
}));
vi.mock("@/lib/pdf/style-extract", () => ({
  extractMenuStyle: extract.extractMenuStyle,
}));
vi.mock("@/lib/blob", () => ({ uploadPhoto: blob.uploadPhoto }));
vi.mock("@/lib/ai-quota", () => ({
  reserveAiCall: quota.reserveAiCall,
  aiQuotaExceededResponse: (retryAfter: number) =>
    new Response(JSON.stringify({ code: "ai_daily_limit" }), {
      status: 429,
      headers: { "Retry-After": String(retryAfter) },
    }),
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
// getDocumentProxy real de recipe-extraction.ts pesa (parsea el PDF de
// verdad); acá sólo nos interesa numPages, así que lo mockeamos.
vi.mock("unpdf", () => ({ getDocumentProxy: pdf.getDocumentProxy }));

import * as route from "../route";

const SPEC = {
  fontCategory: "serif",
  bgColor: "#f4efe4",
  inkColor: "#2b2b2b",
  accentColor: "#8a2432",
  headingColor: "#1d3a2f",
  frame: "single",
  titleAlign: "center",
  titleItalic: true,
  titleSizePt: 28,
  dividerStyle: "accent-rule",
  sectionCase: "uppercase",
  dishLayout: "row",
};

// SOI de JPEG (FF D8 FF) — pasa fileMatchesMime real (no mockeado a propósito).
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

// "%PDF-1.4" — pasa fileMatchesMime real para mime application/pdf.
const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

function postWithFile(bytes: Uint8Array<ArrayBuffer>, mime = "image/jpeg") {
  const form = new FormData();
  form.append("file", new File([bytes], "carta.jpg", { type: mime }));
  return route.POST(
    new NextRequest("https://t.local/api/restaurant/menu-style/from-image", {
      method: "POST",
      body: form,
    }),
  );
}

beforeEach(() => {
  db.restaurant.update.mockReset().mockResolvedValue({ id: "r1" });
  guard.requireAuth
    .mockReset()
    .mockResolvedValue({ userId: "u1", restaurantId: "r1", role: "chef_executive" });
  extract.extractMenuStyle.mockReset().mockResolvedValue(SPEC);
  blob.uploadPhoto.mockReset().mockResolvedValue("https://blob.local/menu-style/r1/x.jpg");
  quota.reserveAiCall.mockReset().mockResolvedValue({ ok: true, used: 1, limit: 120 });
  pdf.getDocumentProxy.mockReset().mockResolvedValue({ numPages: 3 });
});

describe("POST /api/restaurant/menu-style/from-image", () => {
  it("happy path: extrae, sube ref best-effort y persiste el spec en el restaurante", async () => {
    const res = await postWithFile(JPEG_BYTES);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.spec).toEqual(SPEC);

    expect(quota.reserveAiCall).toHaveBeenCalledWith("u1");
    const updateArg = db.restaurant.update.mock.calls[0]![0];
    expect(updateArg.where).toEqual({ id: "r1" });
    expect(updateArg.data.menuStyleSpec).toEqual(SPEC);
    expect(updateArg.data.menuStyleRefUrl).toBe("https://blob.local/menu-style/r1/x.jpg");
  });

  it("si Blob no está configurado (uploadPhoto → null) persiste el spec sin refUrl", async () => {
    blob.uploadPhoto.mockResolvedValue(null);
    const res = await postWithFile(JPEG_BYTES);
    expect(res.status).toBe(200);
    const updateArg = db.restaurant.update.mock.calls[0]![0];
    expect(updateArg.data.menuStyleSpec).toEqual(SPEC);
    expect("menuStyleRefUrl" in updateArg.data).toBe(false);
  });

  it("magic bytes malos → 415 sin gastar cuota ni llamar al extractor", async () => {
    const res = await postWithFile(new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04]));
    expect(res.status).toBe(415);
    const body = await res.json();
    expect(body.code).toBe("file_invalid");
    expect(quota.reserveAiCall).not.toHaveBeenCalled();
    expect(extract.extractMenuStyle).not.toHaveBeenCalled();
    expect(db.restaurant.update).not.toHaveBeenCalled();
  });

  it("MIME no permitido → 415", async () => {
    const res = await postWithFile(JPEG_BYTES, "image/gif");
    expect(res.status).toBe(415);
    expect(extract.extractMenuStyle).not.toHaveBeenCalled();
  });

  it("PDF happy path: extrae con mime pdf respetando el cap de páginas y persiste el spec", async () => {
    pdf.getDocumentProxy.mockResolvedValue({ numPages: 3 });
    const res = await postWithFile(PDF_BYTES, "application/pdf");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.spec).toEqual(SPEC);
    expect(extract.extractMenuStyle).toHaveBeenCalledWith(expect.any(Uint8Array), "application/pdf");
    const updateArg = db.restaurant.update.mock.calls[0]![0];
    expect(updateArg.data.menuStyleSpec).toEqual(SPEC);
  });

  it("PDF con más de 10 páginas → 413 sin gastar cuota ni llamar al extractor", async () => {
    pdf.getDocumentProxy.mockResolvedValue({ numPages: 11 });
    const res = await postWithFile(PDF_BYTES, "application/pdf");
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.code).toBe("file_invalid");
    expect(body.maxPages).toBe(10);
    expect(quota.reserveAiCall).not.toHaveBeenCalled();
    expect(extract.extractMenuStyle).not.toHaveBeenCalled();
  });

  it("mime application/pdf con magic bytes de JPEG → 415", async () => {
    const res = await postWithFile(JPEG_BYTES, "application/pdf");
    expect(res.status).toBe(415);
    expect(pdf.getDocumentProxy).not.toHaveBeenCalled();
    expect(extract.extractMenuStyle).not.toHaveBeenCalled();
  });

  it("PDF ilegible (getDocumentProxy lanza) → 415 sin gastar cuota", async () => {
    pdf.getDocumentProxy.mockRejectedValue(new Error("bad pdf"));
    const res = await postWithFile(PDF_BYTES, "application/pdf");
    expect(res.status).toBe(415);
    const body = await res.json();
    expect(body.code).toBe("file_invalid");
    expect(quota.reserveAiCall).not.toHaveBeenCalled();
    expect(extract.extractMenuStyle).not.toHaveBeenCalled();
  });

  it("PDF de más de 10MB → 413 antes de leer páginas", async () => {
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    big[0] = 0x25;
    big[1] = 0x50;
    big[2] = 0x44;
    big[3] = 0x46;
    const res = await postWithFile(big, "application/pdf");
    expect(res.status).toBe(413);
    expect(pdf.getDocumentProxy).not.toHaveBeenCalled();
    expect(quota.reserveAiCall).not.toHaveBeenCalled();
  });

  it("cuota agotada → 429 y no llama al extractor", async () => {
    quota.reserveAiCall.mockResolvedValue({ ok: false, retryAfter: 3600, limit: 120 });
    const res = await postWithFile(JPEG_BYTES);
    expect(res.status).toBe(429);
    expect(extract.extractMenuStyle).not.toHaveBeenCalled();
    expect(db.restaurant.update).not.toHaveBeenCalled();
  });

  it("extractor falla → 422 con code recipe_extraction_failed y no persiste", async () => {
    extract.extractMenuStyle.mockRejectedValue(new Error("foto ilegible"));
    const res = await postWithFile(JPEG_BYTES);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe("recipe_extraction_failed");
    expect(db.restaurant.update).not.toHaveBeenCalled();
  });

  it("403 si el usuario no está en un restaurante", async () => {
    guard.requireAuth.mockResolvedValue({ userId: "u1", restaurantId: null, role: "admin" });
    const res = await postWithFile(JPEG_BYTES);
    expect(res.status).toBe(403);
  });
});
