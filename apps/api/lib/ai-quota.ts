// Tope diario de llamadas a la IA por usuario, SOLO cuando se usa la clave
// ANTHROPIC del server. Las llamadas BYOK (clave propia del chef) no pasan por
// acá: no nos cuestan. Esto cierra el agujero de "cualquiera con cuenta puede
// loopear y vaciar la clave compartida" (auditoría jul 2026, urgencia #1).
//
// Contador persistente en Postgres (tabla AiUsage), una fila por (userId, día
// UTC). El rate-limit in-memory de lib/rate-limit.ts es por-lambda y NO sirve
// como tope de costo global; este sí, porque el estado vive en la base.

import { prisma } from "@atelier/db";

// Un chef real hace unas pocas acciones de IA por día. 120 deja margen enorme
// para un día intenso y aun así corta en seco a quien intente abusar. Se puede
// subir sin redeploy de código via la env AI_DAILY_LIMIT en Vercel.
export const AI_DAILY_LIMIT = Math.max(1, Number(process.env.AI_DAILY_LIMIT) || 120);

export type QuotaResult =
  | { ok: true; used: number; limit: number }
  | { ok: false; retryAfter: number; limit: number };

/** Día actual en UTC como "YYYY-MM-DD". */
export function utcDay(now: number = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** Segundos hasta la próxima medianoche UTC (cuando se resetea el contador). */
export function secondsToUtcMidnight(now: number = Date.now()): number {
  const d = new Date(now);
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  return Math.max(1, Math.ceil((next - now) / 1000));
}

/**
 * Reserva un slot de IA para el usuario en el día UTC actual. Incremento
 * atómico via upsert; si tras incrementar supera el tope, devuelve ok:false.
 * No revertimos el incremento en el caso de rechazo: bajo concurrencia
 * preferimos cortar de más que dejar pasar (es un tope de costo, no un contador
 * exacto). Llamar SOLO en el path de la clave del server (byok === null).
 */
export async function reserveAiCall(userId: string): Promise<QuotaResult> {
  const day = utcDay();
  const row = await prisma.aiUsage.upsert({
    where: { userId_day: { userId, day } },
    create: { userId, day, requestCount: 1 },
    update: { requestCount: { increment: 1 } },
    select: { requestCount: true },
  });

  if (row.requestCount > AI_DAILY_LIMIT) {
    return { ok: false, retryAfter: secondsToUtcMidnight(), limit: AI_DAILY_LIMIT };
  }
  return { ok: true, used: row.requestCount, limit: AI_DAILY_LIMIT };
}

/**
 * Suma tokens consumidos al contador del día (best-effort, después de la
 * llamada). Solo para observabilidad del gasto; nunca debe romper la respuesta
 * al chef, por eso traga el error.
 */
export async function recordAiTokens(
  userId: string,
  inputTokens: number,
  outputTokens: number,
): Promise<void> {
  const day = utcDay();
  try {
    await prisma.aiUsage.update({
      where: { userId_day: { userId, day } },
      data: {
        inputTokens: { increment: Math.max(0, Math.round(inputTokens)) },
        outputTokens: { increment: Math.max(0, Math.round(outputTokens)) },
      },
    });
  } catch {
    // La fila existe siempre (reserveAiCall corre antes), pero si por lo que sea
    // no está, no queremos tumbar la respuesta por telemetría de costo.
  }
}

/**
 * Respuesta 429 estándar cuando se agota el tope. `code: "ai_daily_limit"` lo
 * traduce el cliente a un mensaje amable en el idioma del chef.
 */
export function aiQuotaExceededResponse(retryAfter: number): Response {
  return new Response(
    JSON.stringify({
      error: "Límite diario de IA alcanzado.",
      code: "ai_daily_limit",
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfter),
      },
    },
  );
}
