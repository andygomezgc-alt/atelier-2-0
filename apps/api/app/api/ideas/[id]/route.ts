import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { PatchIdeaRequestSchema } from "@atelier/shared";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth(req, "capture_idea");
  if (isNextResponse(ctx)) return ctx;
  const { id } = await params;

  const body = await req.json();
  const parse = PatchIdeaRequestSchema.safeParse(body);
  if (!parse.success)
    return NextResponse.json({ error: parse.error.flatten() }, { status: 400 });

  const existing = await prisma.idea.findUnique({ where: { id } });
  if (!existing || existing.restaurantId !== ctx.restaurantId)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: { text?: string; status?: "open" | "in_chat" | "archived" } = {};
  if (parse.data.text !== undefined) data.text = parse.data.text;
  if (parse.data.status !== undefined) data.status = parse.data.status;

  const updated = await prisma.idea.update({ where: { id }, data });
  return NextResponse.json({ id: updated.id, text: updated.text, status: updated.status });
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
