import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { can } from "@atelier/shared";
import type { Role } from "@atelier/db";

const { db, guard } = vi.hoisted(() => {
  const recipe = { findUnique: vi.fn(), updateMany: vi.fn() };
  const recipeIngredient = { deleteMany: vi.fn(), createMany: vi.fn() };
  const product = { count: vi.fn() };
  const $transaction = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      recipe: { updateMany: recipe.updateMany, findUnique: recipe.findUnique },
      recipeIngredient,
    }),
  );
  return {
    db: { recipe, recipeIngredient, product, $transaction },
    guard: {
      requireAuth: vi.fn(),
      isNextResponse: (v: unknown) =>
        typeof v === "object" && v !== null && "status" in v && "headers" in v,
    },
  };
});

vi.mock("@atelier/db", () => ({ prisma: db }));
vi.mock("@/lib/permissions-guard", () => ({
  requireAuth: guard.requireAuth,
  isNextResponse: guard.isNextResponse,
}));
vi.mock("@/lib/projections", () => ({
  projectRecipeDetail: (r: unknown) => r,
  recipeDetailInclude: {},
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import * as route from "../route";

// requireAuth mockeado, pero implementa el mismo chequeo de permiso que la
// versión real (permissions-guard.test.ts ya cubre requireAuth en sí) para
// poder ejercer de verdad la política de autorización del PATCH por rol.
function authAs(role: Role) {
  guard.requireAuth.mockImplementation(async (_req: NextRequest, permission?: string) => {
    if (permission && !can(role, permission as Parameters<typeof can>[1])) {
      return NextResponse.json({ error: "Forbidden", code: "forbidden" }, { status: 403 });
    }
    return { userId: "u1", restaurantId: "r1", role };
  });
}

function patch(bodyObj: unknown, id = "rec-1") {
  const req = new NextRequest(`https://t.local/api/recipes/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(bodyObj),
  });
  return route.PATCH(req, { params: Promise.resolve({ id }) });
}

function del(id = "rec-1") {
  const req = new NextRequest(`https://t.local/api/recipes/${id}`, {
    method: "DELETE",
  });
  return route.DELETE(req, { params: Promise.resolve({ id }) });
}

const DRAFT = {
  id: "rec-1",
  restaurantId: "r1",
  deletedAt: null,
  state: "draft",
  title: "Risotto",
  contentJson: { ingredients: ["arroz"], method: ["cocinar"], notes: "" },
  portions: 4,
  salePrice: 1800,
  manualAllergens: [],
  version: 1,
};

const APPROVED = { ...DRAFT, state: "approved" };

beforeEach(() => {
  db.recipe.findUnique.mockReset().mockResolvedValue(DRAFT);
  db.recipe.updateMany.mockReset().mockResolvedValue({ count: 1 });
  db.recipeIngredient.deleteMany.mockReset().mockResolvedValue({ count: 0 });
  db.recipeIngredient.createMany.mockReset().mockResolvedValue({ count: 1 });
  db.product.count.mockReset().mockResolvedValue(0);
  db.$transaction.mockClear();
  guard.requireAuth.mockReset();
});

describe("PATCH /api/recipes/[id]", () => {
  it("403 viewer no puede editar ningún campo (edit_recipe exigido de entrada)", async () => {
    authAs("viewer");
    const res = await patch({ title: "Nuevo título" });
    expect(res.status).toBe(403);
    expect(db.recipe.findUnique).not.toHaveBeenCalled();
  });

  it("200 sous_chef edita salePrice/portions/recipeIngredients de una receta draft", async () => {
    authAs("sous_chef");
    db.recipe.findUnique
      .mockResolvedValueOnce(DRAFT) // lectura de fuera (gate temprano)
      .mockResolvedValueOnce({ state: "draft" }) // P2-1: relectura dentro de la tx
      .mockResolvedValueOnce({ ...DRAFT, salePrice: 2500, portions: 6 });

    const res = await patch({
      salePrice: 2500,
      portions: 6,
      recipeIngredients: [{ rawText: "300g patata" }],
    });

    expect(res.status).toBe(200);
    const updateArg = db.recipe.updateMany.mock.calls[0]![0];
    expect(updateArg.where).toEqual({
      id: "rec-1",
      restaurantId: "r1",
      deletedAt: null,
    });
    expect(updateArg.data.salePrice).toBe(2500);
    expect(updateArg.data.portions).toBe(6);
  });

  it("403 sous_chef no puede tocar salePrice de una receta aprobada", async () => {
    authAs("sous_chef");
    db.recipe.findUnique.mockResolvedValueOnce(APPROVED);
    const res = await patch({ salePrice: 3000 });
    expect(res.status).toBe(403);
    expect(db.recipe.updateMany).not.toHaveBeenCalled();
  });

  it("403 sous_chef no puede tocar recipeIngredients de una receta aprobada", async () => {
    authAs("sous_chef");
    db.recipe.findUnique.mockResolvedValueOnce(APPROVED);
    const res = await patch({ recipeIngredients: [{ rawText: "sal" }] });
    expect(res.status).toBe(403);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("403 sous_chef no puede agregar un alérgeno manual a una receta aprobada", async () => {
    authAs("sous_chef");
    db.recipe.findUnique.mockResolvedValueOnce(APPROVED);
    const res = await patch({ addManualAllergen: "gluten" });
    expect(res.status).toBe(403);
    expect(db.recipe.updateMany).not.toHaveBeenCalled();
  });

  it("403 sous_chef no puede aprobar una receta (approve_recipe requiere admin/chef_executive)", async () => {
    authAs("sous_chef");
    db.recipe.findUnique.mockResolvedValueOnce(DRAFT);
    const res = await patch({ state: "approved" });
    expect(res.status).toBe(403);
    expect(db.recipe.updateMany).not.toHaveBeenCalled();
  });

  it("200 chef_executive aprueba una receta", async () => {
    authAs("chef_executive");
    db.recipe.findUnique.mockResolvedValueOnce(DRAFT);
    const res = await patch({ state: "approved" });
    expect(res.status).toBe(200);
    const updateArg = db.recipe.updateMany.mock.calls[0]![0];
    expect(updateArg.data.state).toBe("approved");
    expect(updateArg.data.approvedById).toBe("u1");
    expect(updateArg.data).not.toHaveProperty("approvedBy");
  });

  it("200 admin edita título, precio e ingredientes de una receta aprobada", async () => {
    authAs("admin");
    db.recipe.findUnique
      .mockResolvedValueOnce(APPROVED) // lectura de fuera (gate temprano, admin pasa)
      .mockResolvedValueOnce({ state: "approved" }) // P2-1: relectura dentro de la tx, admin pasa igual
      .mockResolvedValueOnce({ ...APPROVED, title: "Risotto v2" });

    const res = await patch({
      title: "Risotto v2",
      salePrice: 4000,
      recipeIngredients: [{ rawText: "arroz carnaroli" }],
    });

    expect(res.status).toBe(200);
    const updateArg = db.recipe.updateMany.mock.calls[0]![0];
    expect(updateArg.data.title).toBe("Risotto v2");
    expect(updateArg.data.salePrice).toBe(4000);
  });

  it("200 sous_chef puede fijar priority en una receta aprobada (no es contenido)", async () => {
    authAs("sous_chef");
    db.recipe.findUnique.mockResolvedValueOnce(APPROVED);
    const res = await patch({ priority: true });
    expect(res.status).toBe(200);
    const updateArg = db.recipe.updateMany.mock.calls[0]![0];
    expect(updateArg.data.priority).toBe(true);
  });

  it("404 si la receta es de otro restaurante (anti-IDOR)", async () => {
    authAs("admin");
    db.recipe.findUnique.mockResolvedValueOnce({ ...DRAFT, restaurantId: "otro" });
    const res = await patch({ title: "Hack" });
    expect(res.status).toBe(404);
    expect(db.recipe.updateMany).not.toHaveBeenCalled();
  });

  it("404 si la receta deja de ser mutable antes del update legacy", async () => {
    authAs("admin");
    db.recipe.findUnique.mockResolvedValueOnce(DRAFT);
    db.recipe.updateMany.mockResolvedValueOnce({ count: 0 });

    const res = await patch({ priority: true });

    expect(res.status).toBe(404);
    expect(db.recipe.updateMany).toHaveBeenCalledWith({
      where: { id: "rec-1", restaurantId: "r1", deletedAt: null },
      data: expect.objectContaining({ priority: true }),
    });
  });

  it("404 atomico no reemplaza ingredientes si la receta deja de ser mutable", async () => {
    authAs("admin");
    db.recipe.findUnique.mockResolvedValueOnce(DRAFT);
    db.recipe.updateMany.mockResolvedValueOnce({ count: 0 });

    const res = await patch({ recipeIngredients: [{ rawText: "sal" }] });

    expect(res.status).toBe(404);
    expect(db.recipeIngredient.deleteMany).not.toHaveBeenCalled();
    expect(db.recipeIngredient.createMany).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/recipes/[id]", () => {
  it("hace soft-delete atomico tenant-scoped", async () => {
    authAs("admin");

    const res = await del();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const arg = db.recipe.updateMany.mock.calls[0]![0];
    expect(arg.where).toEqual({
      id: "rec-1",
      restaurantId: "r1",
      deletedAt: null,
    });
    expect(arg.data.deletedAt).toBeInstanceOf(Date);
    expect(db.recipe.findUnique).not.toHaveBeenCalled();
  });

  it("404 si no hay receta activa del tenant", async () => {
    authAs("admin");
    db.recipe.updateMany.mockResolvedValueOnce({ count: 0 });

    const res = await del();

    expect(res.status).toBe(404);
  });

  // P2-1 (auditoría jul 2026) — TOCTOU: otra request aprueba la receta entre
  // el gate temprano (fuera de la tx) y el update. La relectura DENTRO de la
  // transacción debe ser la vinculante y abortar con 409.
  it("409 approved_conflict: se aprueba entre el gate temprano y el update (path recipeIngredients)", async () => {
    authAs("sous_chef");
    db.recipe.findUnique
      .mockResolvedValueOnce(DRAFT) // gate temprano: todavía draft, pasa
      .mockResolvedValueOnce({ state: "approved" }); // relectura dentro de la tx: ya aprobada
    const res = await patch({ recipeIngredients: [{ rawText: "sal" }] });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("approved_conflict");
    expect(db.recipe.updateMany).not.toHaveBeenCalled();
  });

  it("409 approved_conflict: se aprueba entre el gate temprano y el update (path legacy, solo título)", async () => {
    authAs("sous_chef");
    db.recipe.findUnique
      .mockResolvedValueOnce(DRAFT)
      .mockResolvedValueOnce({ state: "approved" });
    const res = await patch({ title: "Nuevo título" });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("approved_conflict");
    expect(db.recipe.updateMany).not.toHaveBeenCalled();
  });
});
