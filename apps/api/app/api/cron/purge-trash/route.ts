// GET /api/cron/purge-trash
//
// Daily Vercel Cron (vercel.json): deletes for good what has been in the trash
// for more than 7 days, across every restaurant. See lib/trash-purge.ts.
// Auth: "Authorization: Bearer <CRON_SECRET>", same as the other crons; 401 otherwise.
import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { purgeExpiredTrash } from "@/lib/trash-purge";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(req: NextRequest) {
  const expected = Buffer.from(process.env.CRON_SECRET || "");
  const supplied = Buffer.from(req.headers.get("authorization")?.replace(/^Bearer /, "") || "");
  if (!expected.length || expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return new NextResponse("Unauthorized", { status: 401 });
  return NextResponse.json(await purgeExpiredTrash(new Date()));
}
