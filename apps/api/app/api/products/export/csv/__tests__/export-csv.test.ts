import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { db, guard } = vi.hoisted(() => ({
  db: { product: { findMany: vi.fn() } },
  guard: {
    requireAuth: vi.fn(),
    isNextResponse: (v: unknown) =>
      typeof v === "object" && v !== null && "status" in v && "headers" in v,
  },
}));

vi.mock("@atelier/db", () => ({ prisma: db }));
vi.mock("@/lib/permissions-guard", () => ({
  requireAuth: guard.requireAuth,
  isNextResponse: guard.isNextResponse,
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import * as route from "../route";

function get() {
  return route.GET(new NextRequest("https://t.local/api/products/export/csv"));
}

beforeEach(() => {
  db.product.findMany.mockReset().mockResolvedValue([
    {
      name: 'Aceite "extra"; virgen',
      category: "vinagre_aceite",
      unidadCompra: "l",
      precioCompra: 890,
      mermaPct: 0,
      criticality: "media",
      proveedor: "Molino S.L.",
      estado: "activo",
      aliases: ["olio", "aceite oliva"],
    },
  ]);
  guard.requireAuth.mockReset().mockResolvedValue({ userId: "u1", restaurantId: "r1", role: "viewer" });
});

describe("GET /api/products/export/csv", () => {
  it("devuelve CSV con headers, BOM, ; separador y disposition correctos", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="productos.csv"');

    // BOM UTF-8 en los bytes crudos (Response.text() lo consumiría al decodificar).
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);

    const body = new TextDecoder("utf-8").decode(bytes);
    expect(body).toContain('"Nombre";"Categoría";"Unidad de compra"');
    expect(body).toContain('"Aliases"');
  });

  it("escapa comillas y punto y coma en el nombre + une aliases con ' | '", async () => {
    const res = await get();
    const body = await res.text();
    // " → "" y el ; queda dentro del campo entrecomillado
    expect(body).toContain('"Aceite ""extra""; virgen"');
    expect(body).toContain('"olio | aceite oliva"');
    expect(body).toContain('"8,90"'); // precio con coma
  });

  it("401 sin auth (guard devuelve response)", async () => {
    guard.requireAuth.mockResolvedValueOnce({ status: 401, headers: {} });
    const res = await get();
    expect(res.status).toBe(401);
    expect(db.product.findMany).not.toHaveBeenCalled();
  });

  it("scopea al restaurante y excluye archivados + borrados", async () => {
    await get();
    const arg = db.product.findMany.mock.calls[0]![0];
    expect(arg.where.restaurantId).toBe("r1");
    expect(arg.where.deletedAt).toBeNull();
    expect(arg.where.estado).toEqual({ not: "archivado" });
  });

  it("banco vacío → CSV válido con solo el header (no 500)", async () => {
    db.product.findMany.mockResolvedValueOnce([]);
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('"Nombre"');
    // solo header (una línea de datos = ninguna)
    const dataLines = body.replace(/^﻿/, "").trim().split("\r\n");
    expect(dataLines).toHaveLength(1);
  });
});
