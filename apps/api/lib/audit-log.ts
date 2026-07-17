import { prisma, Prisma } from "@atelier/db";
import { logger } from "./logger";

export type AuditAction =
  | "staff_role_changed"
  | "staff_removed"
  | "staff_left"
  | "invite_regenerated"
  | "token_revoked";

// P3-3 (auditoría bugs jul 2026): `audit()` acepta un cliente de transacción
// opcional para que el registro sea atómico con su mutación (antes corría
// fuera de la tx: si el audit fallaba, la acción quedaba sin registro). Los
// call-sites que no pasan cliente siguen usando el `prisma` global sin cambios.
//
// Semántica del error según el contexto:
//   - Sin `client` (fuera de tx): tragamos el error para NUNCA bloquear la
//     acción padre (comportamiento histórico).
//   - Con `client` (dentro de una tx): re-lanzamos. Un fallo del INSERT ya
//     abortó la transacción de Postgres; tragar el error solo dejaría la tx
//     envenenada y el commit fallaría de forma sucia. Re-lanzar hace que la
//     mutación entera revierta limpio (atomicidad: no hay mutación sin audit).
export async function audit(
  opts: {
    restaurantId: string;
    actorId: string | null;
    action: AuditAction;
    targetType?: string;
    targetId?: string;
    payload?: Record<string, unknown>;
  },
  client?: Prisma.TransactionClient,
): Promise<void> {
  const db = client ?? prisma;
  try {
    const { payload, ...rest } = opts;
    await db.auditLog.create({
      data: {
        ...rest,
        payload: payload as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (err) {
    logger.error("audit_log_write_failed", { err: (err as Error).message, action: opts.action });
    // Dentro de una tx debemos propagar para que la mutación revierta atómica.
    if (client) throw err;
  }
}
