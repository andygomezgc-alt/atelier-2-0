import { NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 300;

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

function checkAnthropic(): CheckResult {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ok: true, skipped: true };
  const ok = key.startsWith("sk-ant-");
  if (!ok) {
    logger.error("health_check_failed", {
      check: "anthropic",
      err: "invalid key format",
    });
    return { ok: false, error: "invalid key format" };
  }
  return { ok: true };
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

export async function GET() {
  const [db, anthropic, resend] = await Promise.all([
    checkDb(),
    Promise.resolve(checkAnthropic()),
    Promise.resolve(checkResend()),
  ]);

  const checks = { db, anthropic, resend };
  const allOk = Object.values(checks).every((c) => c.skipped || c.ok);
  const status = allOk ? "ok" : "degraded";

  return NextResponse.json(
    { status, checks, ts: new Date().toISOString() },
    { status: allOk ? 200 : 503 },
  );
}
