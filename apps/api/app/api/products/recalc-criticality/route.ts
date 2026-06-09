// /api/products/recalc-criticality — endpoint manual del admin para
// disparar el recálculo de criticidad sobre SU restaurante. La versión
// automática (cron semanal) vive en /api/cron/recalc-criticality y
// reusa el mismo núcleo (lib/products/recalc.ts).

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@atelier/db";
import { withAuth } from "@/lib/with-auth";
import { logger } from "@/lib/logger";
import { recalcCriticalityForRestaurant } from "@/lib/products/recalc";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RecalcCriticalityRequestSchema = z.object({
  // Si true, devuelve qué cambios se HARÍAN sin tocar la DB.
  dryRun: z.boolean().default(false),
});

// GET — devuelve el timestamp del último recalc para este restaurante
// (lo lee del AuditLog donde el POST graba "criticality_recalc"). Lo usa
// la pantalla Ajustes del banco para mostrar "Último: hace X días".
//
// Sin permiso de admin: cualquier usuario del restaurante puede ver el
// status (es info pública, no escribe nada).
export const GET = withAuth({}, async (ctx) => {
  const lastLog = await prisma.auditLog.findFirst({
    where: {
      restaurantId: ctx.restaurantId!,
      action: "criticality_recalc",
    },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return NextResponse.json({
    lastRunAt: lastLog?.createdAt.toISOString() ?? null,
  });
});

export const POST = withAuth(
  { permission: "edit_restaurant", body: RecalcCriticalityRequestSchema },
  async (ctx, body) => {
    const restaurantId = ctx.restaurantId!;
    const report = await recalcCriticalityForRestaurant(
      restaurantId,
      ctx.userId,
      { dryRun: body.dryRun },
    );
    logger.info("criticality_recalc_applied", {
      restaurantId,
      userId: ctx.userId,
      trigger: "manual",
      dryRun: body.dryRun,
      ...report.summary,
    });
    return NextResponse.json(report);
  },
);
