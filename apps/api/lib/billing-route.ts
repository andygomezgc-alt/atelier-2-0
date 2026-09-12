import { NextRequest, NextResponse } from "next/server";
import { BillingError, billingConfig } from "./billing";
import { requireAuth, isNextResponse } from "./permissions-guard";
import { rateLimit } from "./rate-limit";
import { logger } from "./logger";

export async function billingAction(req: NextRequest, action: (restaurantId: string) => Promise<{ url: string }>) {
  try {
    const config = billingConfig();
    const origin = req.headers.get("origin");
    if ((origin && origin !== config.siteUrl) || (!origin && !req.headers.get("authorization")?.startsWith("Bearer "))) {
      return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
    }
    const ctx = await requireAuth(req, "edit_restaurant");
    if (isNextResponse(ctx)) return ctx;
    if (ctx.role !== "admin" || !ctx.restaurantId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const limit = rateLimit(`billing:${ctx.userId}`, { max: 6, windowMs: 60000 });
    if (!limit.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
    // No lee restaurante, precio, cupón ni URL de retorno del body/query.
    return NextResponse.json(await action(ctx.restaurantId), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof BillingError) return NextResponse.json({ error: error.code }, { status: error.status });
    logger.error("billing_action_failed", { errorType: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ error: "billing_unavailable" }, { status: 503 });
  }
}
