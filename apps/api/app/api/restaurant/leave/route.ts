// Gestión de equipo F3 — POST /api/restaurant/leave
//
// Cualquier miembro autenticado puede pedir salir. La rama efectiva depende
// del case computado por computeLeaveCase:
//
//   A: User.restaurantId = null + audit "staff_left" → 200 {action:"left"}
//   B: 409 {code:"admin_handoff_required", otherMembers:[...]} (sin tocar DB)
//   C: borra restaurante en transacción con 15 DELETEs en orden topológico
//      (validado por dry-run F3-C previo) → 200 {action:"deleted"}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { computeLeaveCase } from "@/lib/leave-cases";
import { audit } from "@/lib/audit-log";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ctx = await requireAuth(req);
  if (isNextResponse(ctx)) return ctx;
  if (!ctx.restaurantId) {
    return NextResponse.json({ error: "Not in a restaurant" }, { status: 404 });
  }

  const result = await computeLeaveCase(ctx.userId, ctx.restaurantId);

  if (result.case === "A") {
    const previousRole = (
      await prisma.user.findUnique({
        where: { id: ctx.userId },
        select: { role: true },
      })
    )?.role;

    await prisma.user.update({
      where: { id: ctx.userId },
      data: { restaurantId: null },
    });

    await audit({
      restaurantId: ctx.restaurantId,
      actorId: ctx.userId,
      action: "staff_left",
      targetType: "User",
      targetId: ctx.userId,
      payload: { previousRole },
    });

    return NextResponse.json({ action: "left" });
  }

  if (result.case === "B") {
    return NextResponse.json(
      {
        error: "admin_handoff_required",
        code: "admin_handoff_required",
        otherMembers: result.otherMembers.map((m) => ({
          id: m.id,
          name: m.name,
          role: m.role,
        })),
      },
      { status: 409 },
    );
  }

  // Caso C — último miembro: borra el restaurante completo.
  //
  // Orden topológico de los 15 DELETEs, validado por dry-run F3-C el
  // 2026-05-24 (snapshot ANTES/DENTRO/DESPUÉS-rollback coincidieron). El
  // orden evita los cinco onDelete=Restrict del schema:
  //   - MenuItem.recipeId Restrict   → MenuItem antes que Recipe
  //   - MenuItem.recipe Restrict     → idem
  //   - Recipe.author Restrict       → Recipe antes que User SetNull
  //   - Idea.author Restrict         → Idea antes que User SetNull
  //   - YieldTest.author Restrict    → YieldTest antes que User SetNull
  // (RecipeIngredient.product es SetNull, no Restrict — no bloquea.)
  //
  // Logueo a logger.info "restaurant_deleted" — el AuditLog asociado se
  // borra en el paso 13, no queda registro queryable en DB después.
  const restaurantId = ctx.restaurantId;
  await prisma.$transaction(async (tx) => {
    await tx.menuItem.deleteMany({ where: { menuFolder: { restaurantId } } });
    await tx.menuClientOverride.deleteMany({
      where: { menuFolder: { restaurantId } },
    });
    await tx.menuSection.deleteMany({ where: { menuFolder: { restaurantId } } });
    await tx.menuFolder.deleteMany({ where: { restaurantId } });
    await tx.recipeIngredient.deleteMany({
      where: { recipe: { restaurantId } },
    });
    await tx.recipe.deleteMany({ where: { restaurantId } });
    await tx.message.deleteMany({
      where: { conversation: { restaurantId } },
    });
    await tx.conversation.deleteMany({ where: { restaurantId } });
    await tx.idea.deleteMany({ where: { restaurantId } });
    await tx.yieldTest.deleteMany({ where: { restaurantId } });
    await tx.productPriceHistory.deleteMany({
      where: { product: { restaurantId } },
    });
    await tx.product.deleteMany({ where: { restaurantId } });
    await tx.auditLog.deleteMany({ where: { restaurantId } });
    await tx.user.updateMany({
      where: { restaurantId },
      data: { restaurantId: null },
    });
    await tx.restaurant.deleteMany({ where: { id: restaurantId } });
  });

  logger.info("restaurant_deleted", {
    restaurantId,
    actorId: ctx.userId,
  });

  return NextResponse.json({ action: "deleted" });
}
