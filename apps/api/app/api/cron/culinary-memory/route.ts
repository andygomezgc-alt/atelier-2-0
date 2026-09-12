import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { processMemory } from "@/lib/culinary-memory/worker";
import { memoryProviderConfig } from "@/lib/culinary-memory/provider";
import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(req: NextRequest) {
  const expected = Buffer.from(process.env.CRON_SECRET || "");
  const supplied = Buffer.from(req.headers.get("authorization")?.replace(/^Bearer /, "") || "");
  if (!expected.length || expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return new NextResponse("Unauthorized", { status: 401 });
  if (!memoryProviderConfig()) return NextResponse.json({ status: "unconfigured", processed: 0 });
  const started = Date.now();
  await prisma.culinaryMemoryRun.updateMany({ where: { status: "running", createdAt: { lt: new Date(started - 300_000) } },
    data: { status: "failed", finishedAt: new Date(), errorCode: "memory_worker_interrupted" } });
  const due = await prisma.culinaryMemory.findMany({ where: { enabled: true, nextCheckAt: { lte: new Date() } },
    orderBy: [{ nextCheckAt: "asc" }, { restaurantId: "asc" }], take: 20, select: { restaurantId: true } });
  const results: string[] = [];
  for (const row of due) {
    if (Date.now() - started > 200_000) break;
    try { results.push(await processMemory(row.restaurantId)); }
    catch { results.push("infrastructure_error"); }
  }
  logger.info("culinary_memory_batch", { processed: results.length, results, durationMs: Date.now() - started });
  return NextResponse.json({ processed: results.length, results });
}
