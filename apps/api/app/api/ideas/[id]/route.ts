import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { z } from "zod";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  status: z.enum(["open", "in_chat", "archived"]).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth(req, "capture_idea");
  if (isNextResponse(ctx)) return ctx;
  const { id } = await params;

  const body = await req.json();
  const parse = PatchSchema.safeParse(body);
  if (!parse.success)
    return NextResponse.json({ error: parse.error.flatten() }, { status: 400 });

  const existing = await prisma.idea.findUnique({ where: { id } });
  if (!existing || existing.restaurantId !== ctx.restaurantId)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await prisma.idea.update({ where: { id }, data: parse.data });
  return NextResponse.json({ id: updated.id, status: updated.status });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth(req, "capture_idea");
  if (isNextResponse(ctx)) return ctx;
  const { id } = await params;

  const existing = await prisma.idea.findUnique({ where: { id } });
  if (!existing || existing.restaurantId !== ctx.restaurantId)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.idea.delete({ where: { id } });
  logger.info("idea_deleted", { ideaId: id, userId: ctx.userId });
  return NextResponse.json({ ok: true });
}
