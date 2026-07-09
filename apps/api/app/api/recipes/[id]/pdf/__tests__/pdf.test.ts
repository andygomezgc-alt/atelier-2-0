import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { db, guard, render } = vi.hoisted(() => ({
  db: { recipe: { findUnique: vi.fn() } },
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

function get(id = "rec-1", lang?: string) {
  const url = `https://t.local/api/recipes/${id}/pdf${lang ? `?lang=${lang}` : ""}`;
  return route.GET(new NextRequest(url), { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  db.recipe.findUnique.mockReset();
  render.renderHtmlToPdf.mockReset().mockResolvedValue(Buffer.from("%PDF-1.4 fake"));
  guard.requireAuth.mockReset().mockResolvedValue({ userId: "u1", restaurantId: "r1", role: "viewer" });
});

describe("GET /api/recipes/[id]/pdf", () => {
  it("devuelve un PDF con las etiquetas en el idioma pedido y escapa el HTML", async () => {
    db.recipe.findUnique.mockResolvedValue({
      title: "Risotto <script>",
      portions: 4,
      contentJson: { ingredients: ["200g arroz"], method: ["cocinar"], notes: "" },
      restaurantId: "r1",
      deletedAt: null,
    });
    const res = await get("rec-1", "it");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");

    const html = render.renderHtmlToPdf.mock.calls[0]![0] as string;
    expect(html).toContain("Risotto &lt;script&gt;"); // escapado
    expect(html).toContain("Ingredienti"); // section_ingredients en it
    expect(html).toContain("4 porzioni"); // pdf_portions it
  });

  it("404 si la receta no existe o está borrada", async () => {
    db.recipe.findUnique.mockResolvedValue(null);
    const res = await get("nope");
    expect(res.status).toBe(404);
    expect(render.renderHtmlToPdf).not.toHaveBeenCalled();
  });

  it("404 si es de otro restaurante (anti-IDOR)", async () => {
    db.recipe.findUnique.mockResolvedValue({
      title: "x", portions: null, contentJson: {}, restaurantId: "otro", deletedAt: null,
    });
    const res = await get("rec-1");
    expect(res.status).toBe(404);
  });

  it("500 si el render falla", async () => {
    db.recipe.findUnique.mockResolvedValue({
      title: "x", portions: null, contentJson: { ingredients: [], method: [], notes: "" }, restaurantId: "r1", deletedAt: null,
    });
    render.renderHtmlToPdf.mockRejectedValue(new Error("chromium boom"));
    const res = await get("rec-1");
    expect(res.status).toBe(500);
  });
});
