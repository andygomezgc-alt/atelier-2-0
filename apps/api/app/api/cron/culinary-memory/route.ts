import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { maintainMemoryRuns, processMemory } from "@/lib/culinary-memory/worker";
import { generateMemory, memoryProviderConfig } from "@/lib/culinary-memory/provider";
import { CRON_DEADLINE_MS, MAINTENANCE_BUDGET_MS, MINIMUM_ROW_TIME_MS } from "@/lib/culinary-memory/scheduling";
import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(req: NextRequest) {
  const expected = Buffer.from(process.env.CRON_SECRET || "");
  const supplied = Buffer.from(req.headers.get("authorization")?.replace(/^Bearer /, "") || "");
  if (!expected.length || expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return new NextResponse("Unauthorized", { status: 401 });
  const startedAt = new Date();
  const deadline = +startedAt + CRON_DEADLINE_MS;
  await maintainMemoryRuns(startedAt, Math.min(deadline - MINIMUM_ROW_TIME_MS, +startedAt + MAINTENANCE_BUDGET_MS));
  const config = memoryProviderConfig();
  if (!config) return NextResponse.json({ status: "unconfigured", processed: 0 });
  const due = await prisma.culinaryMemory.findMany({ where: { enabled: true, nextCheckAt: { lte: startedAt } },
    orderBy: [{ nextCheckAt: "asc" }, { restaurantId: "asc" }], take: 20, select: { restaurantId: true } });
  const results: string[] = [];
  for (const row of due) {
    const remaining = deadline - Date.now();
    if (remaining <= MINIMUM_ROW_TIME_MS) break;
    const signal = AbortSignal.timeout(Math.max(1, remaining));
    try { results.push(await processMemory(row.restaurantId, generateMemory, config, new Date(), signal)); }
    catch { results.push("infrastructure_error"); }
  }
  logger.info("culinary_memory_batch", { processed: results.length, results, durationMs: Date.now() - +startedAt });
  return NextResponse.json({ processed: results.length, results });
}
