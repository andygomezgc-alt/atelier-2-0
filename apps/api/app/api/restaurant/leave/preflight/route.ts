// Gestión de equipo F3 — GET /api/restaurant/leave/preflight
// Read-only. La UI lo pega al abrir el LeaveRestaurantSheet para saber qué
// variante rendear (A/B/C) sin hacer un POST tentativo.
//
// En caso C devuelve también el `restaurantName` para que el sheet pida al
// chef escribirlo como confirmación del borrado destructivo.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { computeLeaveCase } from "@/lib/leave-cases";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = await requireAuth(req);
  if (isNextResponse(ctx)) return ctx;
  if (!ctx.restaurantId) {
    return NextResponse.json({ error: "Not in a restaurant" }, { status: 404 });
  }

  const result = await computeLeaveCase(ctx.userId, ctx.restaurantId);

  if (result.case === "B") {
    return NextResponse.json({
      case: "B",
      otherMembers: result.otherMembers.map((m) => ({
        id: m.id,
        name: m.name,
        role: m.role,
      })),
    });
  }

  if (result.case === "C") {
    // Necesario para el typing-confirm del sheet: el chef tiene que escribir
    // el nombre exacto del restaurante para habilitar el botón Eliminar.
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: ctx.restaurantId },
      select: { name: true },
    });
    return NextResponse.json({
      case: "C",
      restaurantName: restaurant?.name ?? "",
    });
  }

  // Caso A
  return NextResponse.json({ case: "A" });
}
