import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { PatchRecipeRequestSchema, can } from "@atelier/shared";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { logger } from "@/lib/logger";
import { projectRecipeDetail, recipeDetailInclude } from "@/lib/projections";
import { parseIngredient } from "@/lib/products/parser";
import type { Prisma } from "@atelier/db";

// Sub-paso 6 — auto-enrich: si el cliente manda recipeIngredients sin
// qty/unit explícitos, el server los parsea del rawText. Mismo helper que
// /api/recipes (POST). Si después estos crecen, los extraigo a lib/.
function autoEnrich(ing: {
  rawText: string;
  qty?: number | null;
  unit?: string | null;
  pezzatura?: string | null;
}): { qty: number | null; unit: string | null; pezzatura: string | null } {
  const hasQty = ing.qty !== undefined && ing.qty !== null;
  const hasUnit = ing.unit !== undefined && ing.unit !== null;
  if (hasQty && hasUnit) {
    return {
      qty: ing.qty ?? null,
      unit: ing.unit ?? null,
      pezzatura: ing.pezzatura ?? null,
    };
  }
  const parsed = parseIngredient(ing.rawText);
  return {
    qty: hasQty ? (ing.qty ?? null) : parsed.quantity,
    unit: hasUnit ? (ing.unit ?? null) : parsed.unit,
    pezzatura: ing.pezzatura ?? null,
  };
}

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth(req);
  if (isNextResponse(ctx)) return ctx;
  if (!ctx.restaurantId)
    return NextResponse.json({ error: "Not in a restaurant" }, { status: 403 });
  const { id } = await params;

  const recipe = await prisma.recipe.findUnique({
    where: { id },
    include: recipeDetailInclude,
  });

  if (!recipe || recipe.restaurantId !== ctx.restaurantId || recipe.deletedAt !== null)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(projectRecipeDetail(recipe));
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth(req);
  if (isNextResponse(ctx)) return ctx;
  if (!ctx.restaurantId)
    return NextResponse.json({ error: "Not in a restaurant" }, { status: 403 });
  const { id } = await params;

  const body = await req.json();
  const parse = PatchRecipeRequestSchema.safeParse(body);
  if (!parse.success)
    return NextResponse.json({ error: parse.error.flatten() }, { status: 400 });

  const existing = await prisma.recipe.findUnique({ where: { id } });
  if (!existing || existing.restaurantId !== ctx.restaurantId || existing.deletedAt !== null)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Permission gating per state transition
  if (parse.data.state === "in_test" && !can(ctx.role, "advance_to_test"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (parse.data.state === "approved" && !can(ctx.role, "approve_recipe"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if ((parse.data.title || parse.data.contentJson) && !can(ctx.role, "edit_recipe"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Editing content of an approved recipe is admin-only: the team has signed
  // off on this version, so changes need a stricter sign-off than the normal
  // edit_recipe permission. State transitions (priority, etc.) still go
  // through the per-action checks above.
  if (
    existing.state === "approved" &&
    (parse.data.title !== undefined || parse.data.contentJson !== undefined) &&
    ctx.role !== "admin"
  ) {
    return NextResponse.json(
      { error: "Solo el admin puede modificar recetas aprobadas" },
      { status: 403 },
    );
  }

  // Fase 2 alérgenos — gate: no se permite add + remove en el mismo body
  // (semánticamente ambiguo y permitiría que el cliente intente "swap" de
  // alérgeno; el flujo natural del sheet hace un solo tap por vez).
  if (
    parse.data.addManualAllergen !== undefined &&
    parse.data.removeManualAllergen !== undefined
  ) {
    return NextResponse.json(
      { error: "Cannot add and remove allergen in the same request" },
      { status: 400 },
    );
  }

  const data: Prisma.RecipeUpdateInput = {};
  if (parse.data.title !== undefined) data.title = parse.data.title;
  if (parse.data.contentJson !== undefined) data.contentJson = parse.data.contentJson;
  if (parse.data.priority !== undefined) data.priority = parse.data.priority;
  if (parse.data.portions !== undefined) data.portions = parse.data.portions;
  if (parse.data.salePrice !== undefined) data.salePrice = parse.data.salePrice;
  if (parse.data.state !== undefined) {
    data.state = parse.data.state;
    if (parse.data.state === "approved") {
      data.approvedBy = { connect: { id: ctx.userId } };
      data.approvedAt = new Date();
    }
  }
  if (parse.data.title || parse.data.contentJson || parse.data.recipeIngredients) {
    data.version = { increment: 1 };
  }

  // Fase 2 alérgenos — mutaciones idempotentes sobre `manualAllergens`.
  // Postgres scalar arrays no tienen "distinct push" nativo de Prisma; lo
  // resolvemos en JS leyendo la lista actual y asignándola completa.
  if (parse.data.addManualAllergen !== undefined) {
    const current = existing.manualAllergens;
    if (!current.includes(parse.data.addManualAllergen)) {
      data.manualAllergens = { set: [...current, parse.data.addManualAllergen] };
    }
    // Si ya estaba, no-op (no escribimos manualAllergens en el data).
  }
  if (parse.data.removeManualAllergen !== undefined) {
    const current = existing.manualAllergens;
    if (current.includes(parse.data.removeManualAllergen)) {
      data.manualAllergens = {
        set: current.filter((a) => a !== parse.data.removeManualAllergen),
      };
    }
    // Si no estaba, no-op. Heredados de productos NO viven en esta lista,
    // así que intentar removerlos también es no-op (correcto).
  }

  // Si vienen ingredientes estructurados, validamos productIds + reemplazamos
  // las filas existentes (delete + insert) dentro de la misma transacción
  // que el update del Recipe — atómico.
  if (parse.data.recipeIngredients !== undefined) {
    const productIds = parse.data.recipeIngredients
      .map((i) => i.productId)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    if (productIds.length > 0) {
      const count = await prisma.product.count({
        where: {
          id: { in: productIds },
          restaurantId: ctx.restaurantId,
          deletedAt: null,
        },
      });
      if (count !== new Set(productIds).size) {
        return NextResponse.json(
          { error: "invalid_product_reference" },
          { status: 400 },
        );
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.recipe.update({ where: { id }, data });
      await tx.recipeIngredient.deleteMany({ where: { recipeId: id } });
      if (parse.data.recipeIngredients!.length > 0) {
        await tx.recipeIngredient.createMany({
          data: parse.data.recipeIngredients!.map((ing, idx) => {
            const enriched = autoEnrich(ing);
            return {
              recipeId: id,
              productId: ing.productId ?? null,
              position: idx,
              rawText: ing.rawText,
              qty: enriched.qty,
              unit: enriched.unit,
              pezzatura: enriched.pezzatura,
              mermaOverridePct: ing.mermaOverridePct ?? null,
              // Entrega A.5, Fase 7 — override del peso por pieza.
              pesoCalculoG: ing.pesoCalculoG ?? null,
            };
          }),
        });
      }
      return tx.recipe.findUnique({ where: { id }, include: recipeDetailInclude });
    });

    if (!updated) throw new Error("recipe_update_lost");

    if (parse.data.state) {
      logger.info("recipe_state_changed", {
        recipeId: id,
        state: parse.data.state,
        userId: ctx.userId,
      });
    }

    return NextResponse.json(projectRecipeDetail(updated));
  }

  // Path sin ingredientes estructurados (legacy).
  const updated = await prisma.recipe.update({
    where: { id },
    data,
    include: recipeDetailInclude,
  });

  if (parse.data.state) {
    logger.info("recipe_state_changed", {
      recipeId: id,
      state: parse.data.state,
      userId: ctx.userId,
    });
  }

  return NextResponse.json(projectRecipeDetail(updated));
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth(req, "approve_recipe"); // chef_executive+ deletes
  if (isNextResponse(ctx)) return ctx;
  const { id } = await params;

  const existing = await prisma.recipe.findUnique({ where: { id } });
  if (!existing || existing.restaurantId !== ctx.restaurantId || existing.deletedAt !== null)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.recipe.update({ where: { id }, data: { deletedAt: new Date() } });
  logger.info("recipe_deleted", { recipeId: id, userId: ctx.userId });
  return NextResponse.json({ ok: true });
}
