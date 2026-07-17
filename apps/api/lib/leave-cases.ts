// Gestión de equipo F3 — Helper compartido entre POST /api/restaurant/leave
// y GET /api/restaurant/leave/preflight. La lógica del "qué pasa si X sale"
// vive sola acá para que el preflight (read-only) y el POST (que actúa)
// nunca diverjan en el case que devuelven.

import { prisma, Prisma } from "@atelier/db";
import type { Role } from "@atelier/db";
import type { LeaveCase } from "@atelier/shared";

export type LeaveCaseResult = {
  case: LeaveCase;
  // Solo poblado en caso B (único admin, hay otros miembros): los otros
  // miembros para que la UI muestre a quién pasarle el rol.
  otherMembers: Array<{ id: string; name: string; role: Role }>;
};

// `client` opcional: por defecto usa el `prisma` global (preflight read-only).
// El POST /leave lo llama con el cliente de su transacción serializable para
// que el recompute del caso vea el mismo snapshot que el update/borrado y la
// carrera (un miembro que sale/entra a la vez) provoque un conflicto de
// serialización en vez de un caso mal calculado (P1-1 / P1-2).
export async function computeLeaveCase(
  userId: string,
  restaurantId: string,
  client: Prisma.TransactionClient = prisma,
): Promise<LeaveCaseResult> {
  const members = await client.user.findMany({
    where: { restaurantId },
    select: { id: true, name: true, role: true },
  });

  const self = members.find((m) => m.id === userId);
  if (!self) {
    // Defensive: si el caller pasó un user que no está en el restaurant,
    // tratar como "A" para que el caller decida 404/403 según su contexto.
    return { case: "A", otherMembers: [] };
  }

  const others = members.filter((m) => m.id !== userId);

  // Caso C: el que sale es el último miembro.
  if (others.length === 0) {
    return { case: "C", otherMembers: [] };
  }

  // Caso B: el que sale es el único admin pero quedan otros miembros.
  const otherAdmins = others.filter((m) => m.role === "admin");
  if (self.role === "admin" && otherAdmins.length === 0) {
    return { case: "B", otherMembers: others };
  }

  // Caso A: sale directo (no es admin, o no es el único admin).
  return { case: "A", otherMembers: [] };
}
