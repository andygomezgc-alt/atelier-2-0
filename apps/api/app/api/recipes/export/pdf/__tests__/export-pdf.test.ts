import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { db, guard, render } = vi.hoisted(() => ({
  db: {
    restaurant: { findUnique: vi.fn() },
    recipe: { findMany: vi.fn() },
  },
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
  const url = `https://t.local/api/recipes/export/pdf${lang ? `?lang=${lang}` : ""}`;
  return route.GET(new NextRequest(url));
}

beforeEach(() => {
  db.restaurant.findUnique.mockReset().mockResolvedValue({ name: "Trattoria Nonna" });
  db.recipe.findMany.mockReset().mockResolvedValue([
    { title: "Risotto <script>", portions: 4, contentJson: { ingredients: ["200g arroz"], method: ["cocinar"] } },
    { title: "Tiramisú", portions: 6, contentJson: { ingredients: ["mascarpone"], method: [] } },
  ]);
  render.renderHtmlToPdf.mockReset().mockResolvedValue(Buffer.from("%PDF-1.4 fake"));
  guard.requireAuth.mockReset().mockResolvedValue({ userId: "u1", restaurantId: "r1", role: "viewer" });
});

describe("GET /api/recipes/export/pdf", () => {
  it("devuelve el recetario como PDF adjunto y escapa el HTML", async () => {
    const res = await get("it");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="recetario.pdf"');

    const html = render.renderHtmlToPdf.mock.calls[0]![0] as string;
    expect(html).toContain("Risotto &lt;script&gt;"); // escapado
    expect(html).toContain("Tiramisú");
    expect(html).toContain("Trattoria Nonna"); // portada con el nombre del sitio
    expect(html).toContain("Ricettario"); // eyebrow en it
    expect(html).toContain("Ingredienti"); // section_ingredients en it
  });

  it("401 sin auth (guard devuelve response)", async () => {
    guard.requireAuth.mockResolvedValueOnce({ status: 401, headers: {} });
    const res = await get();
    expect(res.status).toBe(401);
    expect(render.renderHtmlToPdf).not.toHaveBeenCalled();
  });

  it("scopea las recetas al restaurante del ctx y excluye borradas", async () => {
    await get();
    const arg = db.recipe.findMany.mock.calls[0]![0];
    expect(arg.where.restaurantId).toBe("r1");
    expect(arg.where.deletedAt).toBeNull();
    expect(db.restaurant.findUnique.mock.calls[0]![0].where.id).toBe("r1");
  });

  it("banco vacío → PDF válido (no 500)", async () => {
    db.recipe.findMany.mockResolvedValueOnce([]);
    const res = await get();
    expect(res.status).toBe(200);
    const html = render.renderHtmlToPdf.mock.calls[0]![0] as string;
    expect(html).toContain("Sin recetas todavía"); // mensaje "sin datos"
  });

  it("500 si el render falla", async () => {
    render.renderHtmlToPdf.mockRejectedValueOnce(new Error("chromium boom"));
    const res = await get();
    expect(res.status).toBe(500);
  });
});
