import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createHash } from "node:crypto";

const { db, guard, extract, generate, blob, quota, pdf, prismaNs } = vi.hoisted(() => ({
  db: { menuStyleVersion: { findFirst: vi.fn(), create: vi.fn(), count: vi.fn() }, restaurant: { update: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() } },
  guard: {
    requireAuth: vi.fn(),
    isNextResponse: (v: unknown) =>
      typeof v === "object" && v !== null && "status" in v && "headers" in v,
  },
  extract: { extractMenuStyle: vi.fn() },
  generate: { generateMenuTheme: vi.fn() },
  blob: { uploadPhoto: vi.fn(), deleteBlobs: vi.fn() },
  quota: { reserveAiCall: vi.fn(), recordAiTokens: vi.fn() },
  pdf: { getDocumentProxy: vi.fn() },
  // Sentinel de Prisma.DbNull (SQL NULL en Json?) para el path de fallo.
  prismaNs: { DbNull: Symbol("DbNull") },
}));

vi.mock("@atelier/db", () => ({ prisma: db, Prisma: prismaNs }));
vi.mock("@/lib/permissions-guard", () => ({
  requireAuth: guard.requireAuth,
  isNextResponse: guard.isNextResponse,
}));
vi.mock("@/lib/pdf/style-extract", () => ({
  extractMenuStyle: extract.extractMenuStyle,
}));
vi.mock("@/lib/pdf/theme-generate", () => ({
  generateMenuTheme: generate.generateMenuTheme,
}));
vi.mock("@/lib/blob", () => ({
  uploadPhoto: blob.uploadPhoto,
  deleteBlobs: blob.deleteBlobs,
}));
vi.mock("@/lib/ai-quota", () => ({
  reserveAiCall: quota.reserveAiCall,
  recordAiTokens: quota.recordAiTokens,
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

vi.mock("@/lib/ai/media", () => ({ visionParts: vi.fn(async () => []) }));

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

// Theme "estilo fiel" que devuelve el generador mockeado (forma libre acá — el
// contenido real lo valida theme-generate.test.ts).
const THEME = {
  version: 1,
  fontTitle: "playfair-display",
  fontBody: "lato",
  fontAccent: null,
  css: ".menu{color:#111;font-family:'Lato',sans-serif;padding:12mm}",
  frameHtml: null,
  headerHtml: "<h1>{{MENU_NAME}}</h1>",
  sectionHeaderHtml: "<div>{{SECTION_NAME}}</div>",
  dishHtml: "<div>{{DISH_NAME}} {{PRICE}}</div>",
  footerHtml: null,
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
  db.menuStyleVersion.findFirst.mockReset().mockResolvedValue(null);
  db.menuStyleVersion.create.mockReset().mockResolvedValue({ id: "v1" });
  db.menuStyleVersion.count.mockReset().mockResolvedValue(0);
  db.restaurant.update.mockReset().mockResolvedValue({ id: "r1" });
  db.restaurant.updateMany.mockReset().mockResolvedValue({ count: 1 });
  db.restaurant.findUnique.mockReset().mockResolvedValue({ menuStyleRefUrl: null });
  guard.requireAuth
    .mockReset()
    .mockResolvedValue({ userId: "u1", restaurantId: "r1", role: "chef_executive" });
  extract.extractMenuStyle.mockReset().mockResolvedValue(SPEC);
  generate.generateMenuTheme.mockReset().mockResolvedValue({ theme: THEME, refined: true });
  blob.uploadPhoto.mockReset().mockResolvedValue("https://blob.local/menu-style/r1/x.jpg");
  blob.deleteBlobs.mockReset().mockResolvedValue(undefined);
  quota.reserveAiCall.mockReset().mockResolvedValue({ ok: true, used: 1, limit: 120 });
  quota.recordAiTokens.mockReset().mockResolvedValue(undefined);
  // Como pdf.js real: DETACHA el typed array recibido (transfer al worker)
  // antes de resolver. Regresión: la ruta debe pasarle una COPIA a unpdf.
  pdf.getDocumentProxy.mockReset().mockImplementation(async (input: Uint8Array) => {
    (input.buffer as ArrayBuffer).transfer?.();
    return { numPages: 3, destroy: vi.fn(async () => {}),
      getPage: async () => ({ getViewport: () => ({ width: 612.283, height: 841.9 }), cleanup: vi.fn() }) };
  });
});

describe("POST /api/restaurant/menu-style/from-image", () => {
  it.each([
    ["bistro", 148, 210], ["brasserie", 297, 210], ["cafe", 210, 297],
  ])("conserva el formato y aísla la propuesta del restaurante %s", async (restaurantId, widthMm, heightMm) => {
    guard.requireAuth.mockResolvedValue({ userId: "chef", restaurantId, role: "chef_executive" });
    pdf.getDocumentProxy.mockResolvedValue({ numPages: 2, destroy: vi.fn(),
      getPage: async () => ({ getViewport: () => ({ width: Number(widthMm) * 72 / 25.4, height: Number(heightMm) * 72 / 25.4 }), cleanup: vi.fn() }),
    });
    expect((await postWithFile(PDF_BYTES, "application/pdf")).status).toBe(200);
    expect(db.menuStyleVersion.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ restaurantId }) }));
    expect(db.menuStyleVersion.create).toHaveBeenCalledWith({ data: expect.objectContaining({ restaurantId }) });
    expect(generate.generateMenuTheme.mock.calls[0]![2].referenceGeometry.pages).toEqual([{ widthMm, heightMm }, { widthMm, heightMm }]);
    expect(db.restaurant.update).not.toHaveBeenCalled();
  });
  it("reutiliza una propuesta idéntica sin cuota, IA ni otra subida", async () => {
    const sha256 = createHash("sha256").update(JPEG_BYTES).digest("hex");
    db.menuStyleVersion.findFirst.mockResolvedValue({ id: "saved", spec: SPEC,
      theme: { ...THEME, reference: { sha256, mimeType: "image/jpeg", refined: true } } });
    const res = await postWithFile(JPEG_BYTES);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ versionId: "saved", spec: SPEC, reused: true });
    expect(quota.reserveAiCall).not.toHaveBeenCalled();
    expect(generate.generateMenuTheme).not.toHaveBeenCalled();
    expect(blob.uploadPhoto).not.toHaveBeenCalled();
    expect(db.menuStyleVersion.create).not.toHaveBeenCalled();
  });
  it("convierte la caché anterior en propuesta sin cambiar el estilo activo", async () => {
    const sha256 = createHash("sha256").update(JPEG_BYTES).digest("hex");
    db.restaurant.findUnique.mockResolvedValue({ menuStyleSpec: SPEC,
      menuStyleTheme: { ...THEME, reference: { sha256, mimeType: "image/jpeg", refined: true } }, menuStyleRefUrl: "https://blob.local/saved.jpg" });
    const res = await postWithFile(JPEG_BYTES);
    expect(await res.json()).toMatchObject({ versionId: "v1", reused: true });
    expect(quota.reserveAiCall).not.toHaveBeenCalled();
    expect(db.menuStyleVersion.create).toHaveBeenCalledWith({ data: expect.objectContaining({ refUrl: "https://blob.local/saved.jpg" }) });
    expect(db.restaurant.updateMany).not.toHaveBeenCalled();
  });
  it("crea una propuesta aunque el estilo activo haya cambiado durante la generación", async () => {
    const res = await postWithFile(JPEG_BYTES);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ versionId: "v1", spec: SPEC, reused: false });
    expect(db.restaurant.update).not.toHaveBeenCalled();
    expect(db.restaurant.updateMany).not.toHaveBeenCalled();
    expect(db.menuStyleVersion.create).toHaveBeenCalledWith({ data: expect.objectContaining({ restaurantId: "r1", spec: SPEC, theme: expect.objectContaining(THEME), refUrl: "https://blob.local/menu-style/r1/x.jpg" }) });
  });
  it("limpia una referencia huérfana si falla guardar la propuesta", async () => {
    db.menuStyleVersion.create.mockRejectedValue(new Error("db unavailable"));
    expect((await postWithFile(JPEG_BYTES)).status).toBe(422);
    expect(blob.deleteBlobs).toHaveBeenCalledWith(["https://blob.local/menu-style/r1/x.jpg"]);
  });
  it("conserva la referencia si el commit se confirmó pese a perder su respuesta", async () => {
    db.menuStyleVersion.create.mockRejectedValue(new Error("connection closed after commit"));
    db.menuStyleVersion.count.mockResolvedValue(1);
    expect((await postWithFile(JPEG_BYTES)).status).toBe(422);
    expect(blob.deleteBlobs).not.toHaveBeenCalled();
  });
  it("conserva la referencia ante un commit incierto", async () => {
    db.menuStyleVersion.create.mockRejectedValue(new Error("db unavailable"));
    db.menuStyleVersion.count.mockRejectedValue(new Error("db unavailable"));
    expect((await postWithFile(JPEG_BYTES)).status).toBe(422);
    expect(blob.deleteBlobs).not.toHaveBeenCalled();
  });
  it("si falla generar el tema no cambia el estilo anterior", async () => {
    generate.generateMenuTheme.mockRejectedValue(new Error("modelo caído"));
    expect((await postWithFile(JPEG_BYTES)).status).toBe(422);
    expect(db.menuStyleVersion.create).not.toHaveBeenCalled();
    expect(db.restaurant.updateMany).not.toHaveBeenCalled();
  });
  it("puede guardar una propuesta sin blob si el almacenamiento no está configurado", async () => {
    blob.uploadPhoto.mockResolvedValue(null);
    expect((await postWithFile(JPEG_BYTES)).status).toBe(200);
    expect(db.menuStyleVersion.create).toHaveBeenCalledWith({ data: expect.objectContaining({ spec: SPEC, refUrl: null }) });
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
    const res = await postWithFile(PDF_BYTES, "application/pdf");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.spec).toEqual(SPEC);
    expect(extract.extractMenuStyle).toHaveBeenCalledWith(expect.any(Uint8Array), "application/pdf", expect.objectContaining({ onUsage: expect.any(Function) }));
    // Regresión: pdf.js detacha el array que se le pasa — el extractor debe
    // recibir el buffer ORIGINAL con sus bytes, no uno vaciado por unpdf.
    expect(extract.extractMenuStyle.mock.calls[0]![0].byteLength).toBeGreaterThan(0);
    expect(generate.generateMenuTheme.mock.calls[0]![2].referenceGeometry.pages).toHaveLength(3);
    expect(generate.generateMenuTheme.mock.calls[0]![2].referenceGeometry.pages[0]).toEqual({ widthMm: 216, heightMm: 297 });
    const createArg = db.menuStyleVersion.create.mock.calls[0]![0];
    expect(createArg.data.spec).toEqual(SPEC);
  });

  it("PDF con más de 10 páginas → 413 sin gastar cuota ni llamar al extractor", async () => {
    pdf.getDocumentProxy.mockResolvedValue({ numPages: 11, destroy: vi.fn(async () => {}) });
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

  it("extractor falla → 422 con code menu_style_extraction_failed y no persiste", async () => {
    extract.extractMenuStyle.mockRejectedValue(new Error("foto ilegible"));
    const res = await postWithFile(JPEG_BYTES);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe("menu_style_extraction_failed");
    expect(db.restaurant.update).not.toHaveBeenCalled();
  });

  it("403 si el usuario no está en un restaurante", async () => {
    guard.requireAuth.mockResolvedValue({ userId: "u1", restaurantId: null, role: "admin" });
    const res = await postWithFile(JPEG_BYTES);
    expect(res.status).toBe(403);
  });
});
