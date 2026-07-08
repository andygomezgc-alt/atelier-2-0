import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Neon serverless cierra conexiones idle: una primera query tras un período
// inactivo necesita reabrir la conexión (~500-1500ms típicamente). 300ms es
// muy agresivo y dispara falsos 503. 3s deja margen sin esconder problemas
// reales.
const TIMEOUT_MS = 3000;

type CheckResult = {
  ok: boolean;
  latencyMs?: number;
  skipped?: boolean;
  error?: string;
};

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout ${ms}ms`)), ms),
    ),
  ]);
}

async function checkDb(): Promise<CheckResult> {
  const start = Date.now();
  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, TIMEOUT_MS);
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("health_check_failed", { check: "db", err: msg });
    return { ok: false, latencyMs: Date.now() - start, error: msg };
  }
}

// Sin `deep`: solo valida el formato (barato, para pings de uptime frecuentes).
// Con `deep`: pega a Anthropic para confirmar que ACEPTA la clave. Una key con
// formato correcto pero revocada pasa el chequeo de formato y sin embargo
// rompe el asistente + extracción con 401 — el deep lo detecta.
async function checkAnthropic(deep: boolean): Promise<CheckResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ok: true, skipped: true };
  if (!key.startsWith("sk-ant-")) {
    logger.error("health_check_failed", {
      check: "anthropic",
      err: "invalid key format",
    });
    return { ok: false, error: "invalid key format" };
  }
  if (!deep) return { ok: true };

  const start = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch("https://api.anthropic.com/v1/models?limit=1", {
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      logger.error("health_check_failed", {
        check: "anthropic",
        err: `status ${res.status}`,
      });
      return { ok: false, latencyMs: Date.now() - start, error: `anthropic ${res.status}` };
    }
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("health_check_failed", { check: "anthropic", err: msg });
    return { ok: false, latencyMs: Date.now() - start, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

function checkResend(): CheckResult {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: true, skipped: true };
  const ok = key.startsWith("re_");
  if (!ok) {
    logger.error("health_check_failed", {
      check: "resend",
      err: "invalid key format",
    });
    return { ok: false, error: "invalid key format" };
  }
  return { ok: true };
}

export async function GET(req: NextRequest) {
  // ?deep=1 valida la clave de IA contra Anthropic (más lento, para chequeos
  // manuales o un cron ocasional). Sin él, chequeo barato de formato.
  const deep = new URL(req.url).searchParams.get("deep") === "1";
  const [db, anthropic, resend] = await Promise.all([
    checkDb(),
    checkAnthropic(deep),
    Promise.resolve(checkResend()),
  ]);

  const checks = { db, anthropic, resend };
  const allOk = Object.values(checks).every((c) => c.skipped || c.ok);
  const status = allOk ? "ok" : "degraded";

  // Higiene: /health es público. El detalle del error (que puede filtrar host
  // de la base, esquema, o el mensaje crudo del driver) se queda en los logs
  // del server (cada check ya hace logger.error); la respuesta solo expone
  // ok/latencia/skipped.
  const publicChecks = Object.fromEntries(
    Object.entries(checks).map(([name, c]) => [
      name,
      {
        ok: c.ok,
        ...(c.latencyMs !== undefined ? { latencyMs: c.latencyMs } : {}),
        ...(c.skipped ? { skipped: true } : {}),
      },
    ]),
  );

  return NextResponse.json(
    { status, checks: publicChecks, ts: new Date().toISOString() },
    { status: allOk ? 200 : 503 },
  );
}
