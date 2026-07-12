// Ruta de prueba de Sentry: lanza un error deliberado para verificar que el
// crash-tracking reporta. Protegida con CRON_SECRET (la misma del cron) —
// sin el secreto responde 404 y no revela que existe.
//
//   GET /api/debug-sentry?secret=<CRON_SECRET>  → 500 + evento en Sentry

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  throw new Error("Prueba de Sentry — si ves esto en Sentry, los avisos funcionan");
}
