import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { db, guard, render } = vi.hoisted(() => ({
  db: { menuStyleVersion: { findFirst: vi.fn() }, menuFolder: { findUnique: vi.fn() } },
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

function get(id = "menu-1", style?: string) {
  const url = `https://t.local/api/menus/${id}/pdf${style ? `?style=${style}` : ""}`;
  return route.GET(new NextRequest(url), { params: Promise.resolve({ id }) });
}

const SPEC = {
  fontCategory: "sans",
  bgColor: "#10222e",
  inkColor: "#e8e2d6",
  accentColor: "#c8a96a",
  headingColor: "#f0ead9",
  frame: "single",
  titleAlign: "left",
  titleItalic: false,
  titleSizePt: 26,
  dividerStyle: "full-hairline",
  sectionCase: "smallcaps",
  dishLayout: "grid",
};

// Theme "estilo fiel" válido, con un marcador (#0a0b0c) y fuente Cinzel para
// verificar que el render usó el theme y no el fallback por spec.
const THEME = {
  version: 1,
  fontTitle: "cinzel",
  fontBody: "lato",
  fontAccent: null,
  css: ".mk{color:#0a0b0c;font-family:'Cinzel',serif;padding:10mm;margin:0}",
  frameHtml: null,
  headerHtml: '<div class="mk"><h1>{{MENU_NAME}}</h1></div>',
  sectionHeaderHtml: "<div>{{SECTION_NAME}}</div>",
  dishHtml: "<div>{{DISH_NAME}} {{PRICE}}</div>",
  footerHtml: null,
};

const baseMenu = (over: Record<string, unknown> = {}) => ({
  id: "menu-1",
  restaurantId: "r1",
  name: "Carta",
  season: null,
  presentationStyle: "custom",
  showAllergensInPdf: true,
  restaurant: { name: "Koko", languageDefault: "es", menuStyleSpec: SPEC },
  sections: [{ id: "s1", name: "Primi" }],
  items: [
    {
      id: "i1",
      sectionId: "s1",
      customName: null,
      customDesc: null,
      price: 2400,
      order: 0,
      recipe: { title: "Tagliatelle", manualAllergens: [], recipeIngredients: [{ productId: "p1", product: { id: "p1", allergen: "gluten", allergens: ["gluten", "eggs"], allergensReviewed: true } }] },
    },
  ],
  clientOverride: null,
  ...over,
});

beforeEach(() => {
  db.menuStyleVersion.findFirst.mockReset().mockResolvedValue({ spec: SPEC, theme: THEME });
  db.menuFolder.findUnique.mockReset();
  render.renderHtmlToPdf.mockReset().mockResolvedValue(Buffer.from("%PDF-1.4 fake"));
  guard.requireAuth
    .mockReset()
    .mockResolvedValue({ userId: "u1", restaurantId: "r1", role: "chef_executive" });
});

describe("GET /api/menus/[id]/pdf — estilo custom", () => {
  it("previsualiza una propuesta del restaurante sin cambiar el menú activo", async () => {
    const menu = baseMenu({ presentationStyle: "elegant" });
    db.menuFolder.findUnique.mockResolvedValue(menu);
    const res = await get("menu-1", "elegant&styleVersionId=draft");
    expect(res.status).toBe(200);
    expect(db.menuStyleVersion.findFirst).toHaveBeenCalledWith({ where: { id: "draft", restaurantId: "r1", discardedAt: null } });
    expect(render.renderHtmlToPdf.mock.calls[0]![0]).toContain("#0a0b0c");
    expect(menu.presentationStyle).toBe("elegant");
  });
  it("rechaza previsualizar versiones ajenas o descartadas", async () => {
    db.menuFolder.findUnique.mockResolvedValue(baseMenu()); db.menuStyleVersion.findFirst.mockResolvedValue(null);
    expect((await get("menu-1", "custom&styleVersionId=foreign")).status).toBe(404);
    expect(render.renderHtmlToPdf).not.toHaveBeenCalled();
  });
  it("requiere permiso de edición para ver propuestas", async () => {
    guard.requireAuth.mockResolvedValue({ restaurantId: "r1", role: "waiter" });
    expect((await get("menu-1", "custom&styleVersionId=draft")).status).toBe(403);
    expect(db.menuStyleVersion.findFirst).not.toHaveBeenCalled();
  });
  it("proyecta el precio por kg y el coperto sin crear ni consultar otra receta", async () => {
    const menu = baseMenu({ serviceCharges: [{ id: "cover", name: "Coperto", price: 400, perPerson: true }] });
    Object.assign(menu.items[0]!, { price: 6000, priceUnit: "kg" });
    db.menuFolder.findUnique.mockResolvedValue(menu);
    expect((await get()).status).toBe(200);
    const html = render.renderHtmlToPdf.mock.calls[0]![0];
    expect(html).toContain("60,00 € / kg"); expect(html).toContain("4,00 € por persona"); expect(html).toContain("Coperto");
  });
  it("impide imprimir alérgenos incompletos y permite un PDF sin esa información", async () => {
    const menu = baseMenu();
    menu.items[0]!.recipe.recipeIngredients[0]!.product.allergensReviewed = false;
    db.menuFolder.findUnique.mockResolvedValue(menu);
    const rejected = await get();
    expect(rejected.status).toBe(422);
    expect(await rejected.json()).toMatchObject({ code: "allergens_incomplete" });
    expect(render.renderHtmlToPdf).not.toHaveBeenCalled();
    menu.showAllergensInPdf = false;
    expect((await get()).status).toBe(200);
  });
  it("usa el mismo filtro de recetas activas que el menú en pantalla", async () => {
    db.menuFolder.findUnique.mockResolvedValue(baseMenu());
    await get();
    expect(db.menuFolder.findUnique.mock.calls[0]![0].include.items.where)
      .toEqual({ recipe: { deletedAt: null } });
  });

  it("no exporta un menú en papelera", async () => {
    db.menuFolder.findUnique.mockResolvedValue(baseMenu({ deletedAt: new Date() }));
    expect((await get()).status).toBe(404);
    expect(render.renderHtmlToPdf).not.toHaveBeenCalled();
  });
  it("custom CON spec → renderiza con el theme de la casa (bg del spec)", async () => {
    db.menuFolder.findUnique.mockResolvedValue(baseMenu());
    const res = await get("menu-1");
    expect(res.status).toBe(200);
    const html = render.renderHtmlToPdf.mock.calls[0]![0] as string;
    expect(html).toContain("background: #10222e");
    expect(html).toContain("grid-template-columns");
    expect(html).toContain("Tagliatelle");
  });

  it("custom CON theme fiel válido → usa renderGeneratedTheme (marcador + fuente embebida)", async () => {
    db.menuFolder.findUnique.mockResolvedValue(
      baseMenu({
        restaurant: {
          name: "Koko",
          languageDefault: "es",
          menuStyleSpec: SPEC,
          menuStyleTheme: THEME,
        },
      }),
    );
    const res = await get("menu-1");
    expect(res.status).toBe(200);
    const html = render.renderHtmlToPdf.mock.calls[0]![0] as string;
    // Marcador del theme + fuente embebida como @font-face + plato real.
    expect(html).toContain("#0a0b0c");
    expect(html).toContain("font-family:'Cinzel'");
    expect(html).toContain("@font-face");
    expect(html).toContain("Tagliatelle");
    // NO cayó al spec (bg del spec ausente).
    expect(html).not.toContain("background: #10222e");
  });

  it("custom con theme corrupto avisa y no cambia de diseño silenciosamente", async () => {
    db.menuFolder.findUnique.mockResolvedValue(
      baseMenu({
        restaurant: {
          name: "Koko",
          languageDefault: "es",
          menuStyleSpec: SPEC,
          menuStyleTheme: { version: 1, css: "corto" },
        },
      }),
    );
    const res = await get("menu-1");
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: "menu_style_invalid" });
    expect(render.renderHtmlToPdf).not.toHaveBeenCalled();
  });

  it("custom sin plantilla pide configurar el estilo", async () => {
    db.menuFolder.findUnique.mockResolvedValue(
      baseMenu({ restaurant: { name: "Koko", languageDefault: "es", menuStyleSpec: null } }),
    );
    const res = await get("menu-1");
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: "menu_style_not_configured" });
    expect(render.renderHtmlToPdf).not.toHaveBeenCalled();
  });

  it("custom con spec corrupto rechaza el PDF", async () => {
    db.menuFolder.findUnique.mockResolvedValue(
      baseMenu({
        restaurant: {
          name: "Koko",
          languageDefault: "es",
          menuStyleSpec: { bgColor: "not-a-hex" },
        },
      }),
    );
    const res = await get("menu-1");
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: "menu_style_invalid" });
    expect(render.renderHtmlToPdf).not.toHaveBeenCalled();
  });

  it("una plantilla sin marcador de contenido no exporta un PDF vacío", async () => {
    db.menuFolder.findUnique.mockResolvedValue(baseMenu({ restaurant: {
      name: "Koko", languageDefault: "es", menuStyleSpec: SPEC,
      menuStyleTheme: { ...THEME, frameHtml: "<div>Solo marco</div>" },
    } }));
    const res = await get();
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: "menu_style_invalid" });
    expect(render.renderHtmlToPdf).not.toHaveBeenCalled();
  });

  it("?style=custom fuerza el estilo de la casa aunque el menú sea elegant", async () => {
    db.menuFolder.findUnique.mockResolvedValue(baseMenu({ presentationStyle: "elegant" }));
    const res = await get("menu-1", "custom");
    expect(res.status).toBe(200);
    const html = render.renderHtmlToPdf.mock.calls[0]![0] as string;
    expect(html).toContain("background: #10222e");
  });

  it("estilo fijo sigue intacto (rustic)", async () => {
    db.menuFolder.findUnique.mockResolvedValue(baseMenu({ presentationStyle: "rustic" }));
    const res = await get("menu-1");
    expect(res.status).toBe(200);
    const html = render.renderHtmlToPdf.mock.calls[0]![0] as string;
    expect(html).toContain("1.5pt double #c47e4f");
  });

  it("404 si el menú es de otro restaurante (anti-IDOR)", async () => {
    db.menuFolder.findUnique.mockResolvedValue(baseMenu({ restaurantId: "otro" }));
    const res = await get("menu-1");
    expect(res.status).toBe(404);
    expect(render.renderHtmlToPdf).not.toHaveBeenCalled();
  });
});
