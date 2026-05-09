import { prisma, Prisma } from "@atelier/db";
import { logger } from "./logger";

export type AuditAction =
  | "staff_role_changed"
  | "staff_removed"
  | "invite_regenerated"
  | "token_revoked";

export async function audit(opts: {
  restaurantId: string;
  actorId: string | null;
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  try {
    const { payload, ...rest } = opts;
    await prisma.auditLog.create({
      data: {
        ...rest,
        payload: payload as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (err) {
    // Never block the parent action; just log telemetry.
    logger.error("audit_log_write_failed", { err: (err as Error).message, action: opts.action });
  }
}
