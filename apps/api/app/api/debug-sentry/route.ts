// Ruta de prueba de Sentry: lanza un error deliberado para verificar que el
// crash-tracking reporta. Protegida con CRON_SECRET (la misma del cron) —
// sin el secreto responde 404 y no revela que existe.
//
// El secreto va SOLO en el header Authorization (no en query string): las URLs
// con el secreto en ?secret= quedan en logs de acceso, proxies e historial.
//
//   curl -H "Authorization: Bearer <CRON_SECRET>" /api/debug-sentry  → 500 + evento en Sentry

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!process.env.CRON_SECRET || bearer !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  throw new Error("Prueba de Sentry — si ves esto en Sentry, los avisos funcionan");
}
