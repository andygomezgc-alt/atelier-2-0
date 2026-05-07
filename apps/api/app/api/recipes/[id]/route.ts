import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { PatchRecipeRequestSchema, can } from "@atelier/shared";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import type { Prisma } from "@atelier/db";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth(req);
  if (isNextResponse(ctx)) return ctx;
  if (!ctx.restaurantId)
    return NextResponse.json({ error: "Not in a restaurant" }, { status: 403 });
  const { id } = await params;

  const recipe = await prisma.recipe.findUnique({
    where: { id },
    include: {
      author: { select: { name: true, email: true } },
      approvedBy: { select: { name: true, email: true } },
    },
  });

  if (!recipe || recipe.restaurantId !== ctx.restaurantId)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    id: recipe.id,
    title: recipe.title,
    state: recipe.state,
    priority: recipe.priority,
    version: recipe.version,
    contentJson: recipe.contentJson,
    authorName: recipe.author?.name ?? recipe.author?.email ?? "—",
    approvedByName: recipe.approvedBy?.name ?? recipe.approvedBy?.email ?? null,
    approvedAt: recipe.approvedAt?.toISOString() ?? null,
    sourceConversationId: recipe.sourceConversationId,
    updatedAt: recipe.updatedAt.toISOString(),
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth(req);
  if (isNextResponse(ctx)) return ctx;
  if (!ctx.restaurantId)
    return NextResponse.json({ error: "Not in a restaurant" }, { status: 403 });
  const { id } = await params;

  const body = await req.json();
  const parse = PatchRecipeRequestSchema.safeParse(body);
  if (!parse.success)
    return NextResponse.json({ error: parse.error.flatten() }, { status: 400 });

  const existing = await prisma.recipe.findUnique({ where: { id } });
  if (!existing || existing.restaurantId !== ctx.restaurantId)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Permission gating per state transition
  if (parse.data.state === "in_test" && !can(ctx.role, "advance_to_test"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (parse.data.state === "approved" && !can(ctx.role, "approve_recipe"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if ((parse.data.title || parse.data.contentJson) && !can(ctx.role, "edit_recipe"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const data: Prisma.RecipeUpdateInput = {};
  if (parse.data.title !== undefined) data.title = parse.data.title;
  if (parse.data.contentJson !== undefined) data.contentJson = parse.data.contentJson;
  if (parse.data.priority !== undefined) data.priority = parse.data.priority;
  if (parse.data.state !== undefined) {
    data.state = parse.data.state;
    if (parse.data.state === "approved") {
      data.approvedBy = { connect: { id: ctx.userId } };
      data.approvedAt = new Date();
    }
  }
  if (parse.data.title || parse.data.contentJson) {
    data.version = { increment: 1 };
  }

  const updated = await prisma.recipe.update({
    where: { id },
    data,
    include: {
      author: { select: { name: true, email: true } },
      approvedBy: { select: { name: true, email: true } },
    },
  });

  return NextResponse.json({
    id: updated.id,
    title: updated.title,
    state: updated.state,
    priority: updated.priority,
    version: updated.version,
    contentJson: updated.contentJson,
    authorName: updated.author?.name ?? updated.author?.email ?? "—",
    approvedByName: updated.approvedBy?.name ?? updated.approvedBy?.email ?? null,
    approvedAt: updated.approvedAt?.toISOString() ?? null,
    sourceConversationId: updated.sourceConversationId,
    updatedAt: updated.updatedAt.toISOString(),
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth(req, "approve_recipe"); // chef_executive+ deletes
  if (isNextResponse(ctx)) return ctx;
  const { id } = await params;

  const existing = await prisma.recipe.findUnique({ where: { id } });
  if (!existing || existing.restaurantId !== ctx.restaurantId)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.recipe.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
