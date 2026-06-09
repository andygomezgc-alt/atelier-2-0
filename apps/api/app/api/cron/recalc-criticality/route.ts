// GET /api/cron/recalc-criticality
//
// Endpoint disparado por Vercel Cron semanalmente (config en `vercel.json`,
// schedule "0 4 * * 1" = lunes 4:00 UTC). Reusa el núcleo del recalc
// (lib/products/recalc.ts) que también usa el endpoint manual de admin.
//
// AUTH: Authorization "Bearer <CRON_SECRET>". Sin un token válido, 401.
// Vercel Cron inyecta el header automáticamente leyendo CRON_SECRET de
// las env vars del proyecto. Cualquier request directa (curl, browser,
// etc.) que no presente el token es rechazada — no hay path para que un
// usuario casual gatee el recalc global.
//
// Comparación timing-safe vía crypto.timingSafeEqual para no filtrar
// info sobre la longitud/prefijo del secret en ataques de tiempo.
//
// Itera TODOS los restaurantes del sistema. AuditLog se graba con
// actorId=null para marcar que fue automático (vs. trigger manual).

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@atelier/db";
import { logger } from "@/lib/logger";
import {
  recalcCriticalityForRestaurant,
  type RecalcSummary,
} from "@/lib/products/recalc";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min — puede haber muchos restaurantes

function isAuthorizedCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  // Si el deploy no tiene la env var configurada, rechazamos todo. Mejor
  // que aceptar silenciosamente con secret vacío.
  if (!secret || secret.length === 0) return false;
  const header = req.headers.get("authorization");
  if (!header || !header.startsWith("Bearer ")) return false;
  const token = header.slice("Bearer ".length).trim();
  // Comparación timing-safe. Buffers de la misma longitud — si difieren
  // en longitud directamente devolvemos false sin llamar timingSafeEqual
  // (la función tira si los buffers son de tamaños distintos).
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    logger.warn("cron_recalc_unauthorized", {
      path: req.nextUrl.pathname,
      hasHeader: req.headers.get("authorization") !== null,
    });
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const startedAt = new Date();
  const restaurants = await prisma.restaurant.findMany({
    select: { id: true },
  });

  const reports: Array<{
    restaurantId: string;
    summary?: RecalcSummary;
    error?: string;
  }> = [];

  for (const r of restaurants) {
    try {
      const report = await recalcCriticalityForRestaurant(r.id, null, {
        dryRun: false,
      });
      reports.push({ restaurantId: r.id, summary: report.summary });
    } catch (err) {
      reports.push({
        restaurantId: r.id,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  const totalChanges = reports.reduce(
    (sum, r) => sum + (r.summary?.changes ?? 0),
    0,
  );
  const errors = reports.filter((r) => r.error).length;
  const durationMs = Date.now() - startedAt.getTime();

  logger.info("cron_recalc_finished", {
    restaurants: restaurants.length,
    totalChanges,
    errors,
    durationMs,
  });

  return NextResponse.json({
    ok: true,
    restaurants: restaurants.length,
    totalChanges,
    errors,
    durationMs,
    reports,
  });
}
