// GET /api/cron/purge-trash
//
// Daily Vercel Cron (vercel.json): deletes for good what has been in the trash
// for more than 7 days, across every restaurant. See lib/trash-purge.ts.
// Auth: "Authorization: Bearer <CRON_SECRET>", same as the other crons; 401 otherwise.
import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { purgeExpiredTrash } from "@/lib/trash-purge";
import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(req: NextRequest) {
  const expected = Buffer.from(process.env.CRON_SECRET || "");
  const supplied = Buffer.from(req.headers.get("authorization")?.replace(/^Bearer /, "") || "");
  if (!expected.length || expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return new NextResponse("Unauthorized", { status: 401 });
  // Rows that fail are skipped and reported by the purge itself; this only catches the unexpected.
  try {
    return NextResponse.json(await purgeExpiredTrash(new Date()));
  } catch (error) {
    logger.error("trash_purge_crashed", { error, message: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "purge_failed" }, { status: 500 });
  }
}
