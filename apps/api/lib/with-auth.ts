import { NextRequest, NextResponse } from "next/server";
import type { ZodType } from "zod";
import { requireAuth, isNextResponse, type AuthedContext } from "./permissions-guard";
import { logger } from "./logger";
import type { Permission } from "@atelier/shared";

type Handler<T> = (
  ctx: AuthedContext,
  body: T,
  req: NextRequest,
) => Promise<NextResponse>;

type Options<T> = {
  permission?: Permission;
  body?: ZodType<T, any, any>;
  requireRestaurant?: boolean;
};

export function withAuth<T = unknown>(
  opts: Options<T>,
  handler: Handler<T>,
): (req: NextRequest) => Promise<NextResponse> {
  return async (req: NextRequest) => {
    try {
      const ctx = await requireAuth(req, opts.permission);
      if (isNextResponse(ctx)) return ctx;

      if (opts.requireRestaurant !== false && !ctx.restaurantId) {
        return NextResponse.json({ error: "user_not_in_restaurant" }, { status: 400 });
      }

      let body: T = undefined as unknown as T;
      if (opts.body) {
        const raw = await req.json();
        const parse = opts.body.safeParse(raw);
        if (!parse.success) {
          return NextResponse.json(
            { error: "invalid_body", issues: parse.error.issues },
            { status: 400 },
          );
        }
        body = parse.data;
      }

      return await handler(ctx, body, req);
    } catch (err) {
      logger.error("with_auth_internal_error", {
        path: req.nextUrl?.pathname,
        method: req.method,
        error: err instanceof Error ? err.message : String(err),
      });
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }
  };
}
