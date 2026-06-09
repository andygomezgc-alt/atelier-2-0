// Gestión de equipo F3 — Helper compartido entre POST /api/restaurant/leave
// y GET /api/restaurant/leave/preflight. La lógica del "qué pasa si X sale"
// vive sola acá para que el preflight (read-only) y el POST (que actúa)
// nunca diverjan en el case que devuelven.

import { prisma } from "@atelier/db";
import type { Role } from "@atelier/db";
import type { LeaveCase } from "@atelier/shared";

export type LeaveCaseResult = {
  case: LeaveCase;
  // Solo poblado en caso B (único admin, hay otros miembros): los otros
  // miembros para que la UI muestre a quién pasarle el rol.
  otherMembers: Array<{ id: string; name: string; role: Role }>;
};

export async function computeLeaveCase(
  userId: string,
  restaurantId: string,
): Promise<LeaveCaseResult> {
  const members = await prisma.user.findMany({
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
