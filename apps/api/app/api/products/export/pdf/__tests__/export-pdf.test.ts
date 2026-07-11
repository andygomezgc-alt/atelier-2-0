import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { db, guard, render } = vi.hoisted(() => ({
  db: { product: { findMany: vi.fn() } },
  guard: {
    requireAuth: vi.fn(),
    isNextResponse: (v: unknown) =>
      typeof v === "object" && v !== null && "status" in v && "headers" in v,
  },
  render: { renderHtmlToPdf: vi.fn() },
}));

vi.mock("@atelier/db", () => ({ prisma: db }));
vi.mock("@/lib/permissions-guard", () => ({
  requireAuth: guard.requireAuth,
  isNextResponse: guard.isNextResponse,
}));
vi.mock("@/lib/pdf/render", () => ({ renderHtmlToPdf: render.renderHtmlToPdf }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import * as route from "../route";

function get(lang?: string) {
  const url = `https://t.local/api/products/export/pdf${lang ? `?lang=${lang}` : ""}`;
  return route.GET(new NextRequest(url));
}

const PRODUCTS = [
  {
    name: "Ricciola <b>",
    category: "pescado",
    unidadCompra: "kg",
    precioCompra: 3200,
    mermaPct: 15,
    criticality: "alta",
    proveedor: "Pescadería X",
    estado: "activo",
  },
];

beforeEach(() => {
  db.product.findMany.mockReset().mockResolvedValue(PRODUCTS);
  render.renderHtmlToPdf.mockReset().mockResolvedValue(Buffer.from("%PDF-1.4 fake"));
  guard.requireAuth.mockReset().mockResolvedValue({ userId: "u1", restaurantId: "r1", role: "viewer" });
});

describe("GET /api/products/export/pdf", () => {
  it("devuelve el banco como PDF adjunto, con labels y precio con coma", async () => {
    const res = await get("es");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="productos.pdf"');

    const html = render.renderHtmlToPdf.mock.calls[0]![0] as string;
    expect(html).toContain("Ricciola &lt;b&gt;"); // escapado
    expect(html).toContain("Pescado"); // category_pescado (es)
    expect(html).toContain("Alta"); // criticality_alta (es)
    expect(html).toContain("32,00"); // precio con coma decimal
    expect(html).toContain("15%");
  });

  it("401 sin auth (guard devuelve response)", async () => {
    guard.requireAuth.mockResolvedValueOnce({ status: 401, headers: {} });
    const res = await get();
    expect(res.status).toBe(401);
    expect(render.renderHtmlToPdf).not.toHaveBeenCalled();
  });

  it("scopea al restaurante y excluye archivados + borrados", async () => {
    await get();
    const arg = db.product.findMany.mock.calls[0]![0];
    expect(arg.where.restaurantId).toBe("r1");
    expect(arg.where.deletedAt).toBeNull();
    expect(arg.where.estado).toEqual({ not: "archivado" });
  });

  it("banco vacío → PDF válido (no 500)", async () => {
    db.product.findMany.mockResolvedValueOnce([]);
    const res = await get();
    expect(res.status).toBe(200);
    const html = render.renderHtmlToPdf.mock.calls[0]![0] as string;
    expect(html).toContain("Sin productos todavía");
  });

  it("500 si el render falla", async () => {
    render.renderHtmlToPdf.mockRejectedValueOnce(new Error("chromium boom"));
    const res = await get();
    expect(res.status).toBe(500);
  });
});
