import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { logger } from "@/lib/logger";
import { PROVIDER_KEY_ENV, type AiProvider } from "@/lib/ai/config";

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

// Each AI key is verified against its provider's free model listing, so a
// revoked or wrong key reads as degraded even though its format looks right.
// /health is public: each instance reuses a verification for VERIFY_TTL_MS, so
// uptime pings and repeated hits cost one provider call per window. ?deep=1
// verifies again right away.
const VERIFY_TTL_MS = 5 * 60_000;
const KEY_PROBES: Record<AiProvider, (key: string) => { url: string; headers: Record<string, string> }> = {
  anthropic: key => ({ url: "https://api.anthropic.com/v1/models?limit=1", headers: { "x-api-key": key, "anthropic-version": "2023-06-01" } }),
  gemini: key => ({ url: "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", headers: { "x-goog-api-key": key } }),
  zai: key => ({ url: "https://api.z.ai/api/paas/v4/models", headers: { Authorization: `Bearer ${key}` } }),
};
const verifications = new Map<AiProvider, { at: number; result: Promise<CheckResult> }>();

async function verifyKey(provider: AiProvider): Promise<CheckResult> {
  const key = process.env[PROVIDER_KEY_ENV[provider]]?.trim();
  if (!key) return { ok: false, error: "provider not configured" };
  const { url, headers } = KEY_PROBES[provider](key);
  const start = Date.now();
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) {
      logger.error("health_check_failed", { check: provider, err: `status ${res.status}` });
      return { ok: false, latencyMs: Date.now() - start, error: `${provider} ${res.status}` };
    }
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("health_check_failed", { check: provider, err: msg });
    return { ok: false, latencyMs: Date.now() - start, error: msg };
  }
}

function checkProvider(provider: AiProvider, fresh: boolean): Promise<CheckResult> {
  const recent = verifications.get(provider);
  if (!fresh && recent && Date.now() - recent.at < VERIFY_TTL_MS) return recent.result;
  // The pending promise is stored, so concurrent requests share one provider call.
  const result = verifyKey(provider);
  verifications.set(provider, { at: Date.now(), result });
  return result;
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
  // ?deep=1 verifies the AI keys again instead of reusing a recent answer.
  const deep = new URL(req.url).searchParams.get("deep") === "1";
  const [db, anthropic, gemini, zai, resend] = await Promise.all([
    checkDb(),
    checkProvider("anthropic", deep),
    checkProvider("gemini", deep),
    checkProvider("zai", deep),
    Promise.resolve(checkResend()),
  ]);

  // Key verification only: model listings are free, never a paid generation.
  const checks: Record<string, CheckResult> = { db, anthropic, gemini, zai, resend };
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
