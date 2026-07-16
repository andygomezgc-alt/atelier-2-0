import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { PatchStaffMemberRequestSchema } from "@atelier/shared";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { audit } from "@/lib/audit-log";

export const dynamic = "force-dynamic";

// P2-5 (auditoría jul 2026): invariante "último admin" — un restaurante nunca
// debe quedarse sin ningún admin. Se usa para abortar la transacción desde
// dentro del callback y distinguirlo de cualquier otro error inesperado.
class LastAdminError extends Error {}

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

  let updated: { id: string; role: (typeof target)["role"] };
  try {
    updated = await prisma.$transaction(async (tx) => {
      // Si esto degrada a un admin, contamos DENTRO de la transacción (no
      // antes) para cerrar el TOCTOU: dos PATCH concurrentes sobre dos admins
      // distintos podrían leer count=2 cada uno fuera de una transacción y
      // dejar el restaurante con 0 admins.
      if (oldRole === "admin" && newRole !== "admin") {
        const adminCount = await tx.user.count({
          where: { restaurantId: ctx.restaurantId, role: "admin" },
        });
        if (adminCount <= 1) throw new LastAdminError();
      }
      return tx.user.update({
        where: { id: userId },
        data: { role: newRole },
        select: { id: true, role: true },
      });
    });
  } catch (err) {
    if (err instanceof LastAdminError)
      return NextResponse.json({ error: "last_admin", code: "last_admin" }, { status: 409 });
    throw err;
  }

  await audit({
    restaurantId: ctx.restaurantId,
    actorId: ctx.userId,
    action: "staff_role_changed",
    targetType: "User",
    targetId: userId,
    payload: { from: oldRole, to: newRole },
  });

  return NextResponse.json({ id: updated.id, role: updated.role });
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
    await prisma.$transaction(async (tx) => {
      // Mismo invariante que el PATCH: expulsar al último admin dejaría el
      // restaurante sin nadie que administre. Contamos dentro de la
      // transacción para cerrar el TOCTOU con expulsiones/degradaciones
      // concurrentes de admins distintos.
      if (target.role === "admin") {
        const adminCount = await tx.user.count({
          where: { restaurantId: ctx.restaurantId, role: "admin" },
        });
        if (adminCount <= 1) throw new LastAdminError();
      }
      await tx.user.update({
        where: { id: userId },
        data: { restaurantId: null },
      });
    });
  } catch (err) {
    if (err instanceof LastAdminError)
      return NextResponse.json({ error: "last_admin", code: "last_admin" }, { status: 409 });
    throw err;
  }

  await audit({
    restaurantId: ctx.restaurantId,
    actorId: ctx.userId,
    action: "staff_removed",
    targetType: "User",
    targetId: userId,
    payload: { previousRole: target.role },
  });

  return NextResponse.json({ ok: true });
}
