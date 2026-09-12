import type { NextRequest } from "next/server";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { ownerBudgetStatus } from "@/lib/ai/budget";

export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const ctx = await requireAuth(req);
  if (isNextResponse(ctx)) return ctx;
  return Response.json({ budget: await ownerBudgetStatus(ctx.userId) }, { headers: { "Cache-Control": "no-store" } });
}
