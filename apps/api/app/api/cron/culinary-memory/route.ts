import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { maintainMemoryRuns, processMemory, type MemoryRunStatus } from "@/lib/culinary-memory/worker";
import { generateMemory, memoryProviderConfig } from "@/lib/culinary-memory/provider";
import { CRON_DEADLINE_MS, IMPORT_ORPHAN_MS, MAINTENANCE_BUDGET_MS, MINIMUM_ROW_TIME_MS } from "@/lib/culinary-memory/scheduling";
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
  // Besides the due rows, an import whose own run ended without learning (an old marker) is learned here.
  // Orphans go first so due rows cannot crowd them out of the batch.
  const orphanedBefore = new Date(+startedAt - IMPORT_ORPHAN_MS);
  const due = await prisma.culinaryMemory.findMany({
    where: { enabled: true, OR: [{ nextCheckAt: { lte: startedAt } }, { importPendingAt: { lte: orphanedBefore } }] },
    orderBy: [{ importPendingAt: { sort: "asc", nulls: "last" } }, { nextCheckAt: "asc" }, { restaurantId: "asc" }],
    take: 20, select: { restaurantId: true, importTicket: true, importPendingAt: true },
  });
  const results: (MemoryRunStatus | "infrastructure_error")[] = [];
  for (const row of due) {
    const remaining = deadline - Date.now();
    if (remaining <= MINIMUM_ROW_TIME_MS) break;
    const signal = AbortSignal.timeout(Math.max(1, remaining));
    try {
      // Clearing the marker first, fenced by the ticket, makes the recovery happen at most once.
      const orphan = !!row.importPendingAt && row.importPendingAt <= orphanedBefore && (await prisma.culinaryMemory.updateMany({
        where: { restaurantId: row.restaurantId, importTicket: row.importTicket, importPendingAt: { not: null } }, data: { importPendingAt: null },
      })).count === 1;
      results.push(orphan
        ? await processMemory(row.restaurantId, generateMemory, config, new Date(), signal, { afterImport: true })
        : await processMemory(row.restaurantId, generateMemory, config, new Date(), signal));
    } catch { results.push("infrastructure_error"); }
  }
  logger.info("culinary_memory_batch", { processed: results.length, results, durationMs: Date.now() - +startedAt });
  return NextResponse.json({ processed: results.length, results });
}
