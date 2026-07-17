import { NextRequest, NextResponse } from "next/server";
import { prisma, Prisma } from "@atelier/db";
import { PatchStaffMemberRequestSchema } from "@atelier/shared";
import { generateInviteCode } from "@atelier/shared/invite-code";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { audit } from "@/lib/audit-log";

export const dynamic = "force-dynamic";

// P2-5 (auditoría seguridad) + P1-2 (auditoría bugs): invariante "último admin"
// — un restaurante nunca debe quedarse sin ningún admin. Se lanza desde dentro
// de la transacción para abortarla y distinguirla de un error inesperado.
class LastAdminError extends Error {}
// P2-3 (auditoría bugs): el target cambió de restaurante entre la lectura y la
// escritura → el updateMany filtrado por restaurantId no toca ninguna fila.
// Abortamos en vez de escribir a alguien de otro restaurante.
class TargetMovedError extends Error {}

// P1-2: reintenta la transacción ante un conflicto de serialización (P2034).
// Serializable cierra el write-skew de "dos degradaciones/expulsiones
// concurrentes sobre admins distintos dejan 0 admins" (bajo READ COMMITTED cada
// una contaría 2 sin ver la escritura de la otra y ambas commitearían).
async function withSerializableRetry<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2034" &&
        attempt < MAX_ATTEMPTS
      ) {
        await new Promise((r) => setTimeout(r, 10 * attempt));
        continue;
      }
      throw err;
    }
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const ctx = await requireAuth(req, "change_role");
  if (isNextResponse(ctx)) return ctx;
  const { userId } = await params;

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target || target.restaurantId !== ctx.restaurantId)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (target.id === ctx.userId)
    return NextResponse.json({ error: "Cannot change your own role" }, { status: 400 });

  const body = await req.json();
  const parse = PatchStaffMemberRequestSchema.safeParse(body);
  if (!parse.success)
    return NextResponse.json({ error: parse.error.flatten() }, { status: 400 });

  const oldRole = target.role;
  const newRole = parse.data.role;

  try {
    await withSerializableRetry(async (tx) => {
      // Contar admins DENTRO de la tx serializable (no antes) cierra el TOCTOU:
      // dos PATCH concurrentes sobre dos admins distintos se serializan.
      if (oldRole === "admin" && newRole !== "admin") {
        const adminCount = await tx.user.count({
          where: { restaurantId: ctx.restaurantId, role: "admin" },
        });
        if (adminCount <= 1) throw new LastAdminError();
      }
      // P2-3: filtramos por restaurantId además del id y verificamos que se
      // tocó exactamente 1 fila (si el target migró de restaurante entre la
      // lectura y aquí, count=0 → no escribimos a nadie de otro restaurante).
      const res = await tx.user.updateMany({
        where: { id: userId, restaurantId: ctx.restaurantId },
        data: { role: newRole },
      });
      if (res.count !== 1) throw new TargetMovedError();

      // P3-3: el audit va dentro de la tx → atómico con la mutación.
      await audit(
        {
          restaurantId: ctx.restaurantId,
          actorId: ctx.userId,
          action: "staff_role_changed",
          targetType: "User",
          targetId: userId,
          payload: { from: oldRole, to: newRole },
        },
        tx,
      );
    });
  } catch (err) {
    if (err instanceof LastAdminError)
      return NextResponse.json({ error: "last_admin", code: "last_admin" }, { status: 409 });
    if (err instanceof TargetMovedError)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw err;
  }

  return NextResponse.json({ id: userId, role: newRole });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const ctx = await requireAuth(req, "manage_members");
  if (isNextResponse(ctx)) return ctx;
  const { userId } = await params;

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target || target.restaurantId !== ctx.restaurantId)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (target.id === ctx.userId)
    return NextResponse.json({ error: "Cannot remove yourself" }, { status: 400 });

  try {
    await withSerializableRetry(async (tx) => {
      // Mismo invariante que el PATCH: expulsar al último admin dejaría el
      // restaurante sin nadie que administre.
      if (target.role === "admin") {
        const adminCount = await tx.user.count({
          where: { restaurantId: ctx.restaurantId, role: "admin" },
        });
        if (adminCount <= 1) throw new LastAdminError();
      }
      // P2-3: guard por restaurantId + verificación de count.
      const res = await tx.user.updateMany({
        where: { id: userId, restaurantId: ctx.restaurantId },
        data: { restaurantId: null },
      });
      if (res.count !== 1) throw new TargetMovedError();

      // P1-3: rotar el código de invitación en la MISMA tx que la expulsión,
      // para que el código que el expulsado pudo memorizar/capturar deje de
      // servir de inmediato. Necesitamos el nombre para el slug del código.
      const r = await tx.restaurant.findUnique({
        where: { id: ctx.restaurantId },
        select: { name: true },
      });
      await tx.restaurant.update({
        where: { id: ctx.restaurantId },
        data: { inviteCode: generateInviteCode(r?.name ?? null) },
      });

      // P3-3: audit dentro de la tx.
      await audit(
        {
          restaurantId: ctx.restaurantId,
          actorId: ctx.userId,
          action: "staff_removed",
          targetType: "User",
          targetId: userId,
          payload: { previousRole: target.role },
        },
        tx,
      );
    });
  } catch (err) {
    if (err instanceof LastAdminError)
      return NextResponse.json({ error: "last_admin", code: "last_admin" }, { status: 409 });
    if (err instanceof TargetMovedError)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw err;
  }

  return NextResponse.json({ ok: true });
}
