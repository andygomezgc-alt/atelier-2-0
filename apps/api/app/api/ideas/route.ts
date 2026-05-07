import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { CreateIdeaRequestSchema } from "@atelier/shared";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = await requireAuth(req);
  if (isNextResponse(ctx)) return ctx;
  if (!ctx.restaurantId)
    return NextResponse.json({ error: "Not in a restaurant" }, { status: 403 });

  const ideas = await prisma.idea.findMany({
    where: { restaurantId: ctx.restaurantId },
    orderBy: { createdAt: "desc" },
    include: { author: { select: { name: true, email: true } } },
    take: 100,
  });

  return NextResponse.json(
    ideas.map((i) => ({
      id: i.id,
      text: i.text,
      status: i.status,
      createdAt: i.createdAt.toISOString(),
      authorName: i.author?.name ?? i.author?.email ?? "—",
    })),
  );
}

export async function POST(req: NextRequest) {
  const ctx = await requireAuth(req, "capture_idea");
  if (isNextResponse(ctx)) return ctx;

  const body = await req.json();
  const parse = CreateIdeaRequestSchema.safeParse(body);
  if (!parse.success)
    return NextResponse.json({ error: parse.error.flatten() }, { status: 400 });

  const idea = await prisma.idea.create({
    data: {
      text: parse.data.text,
      restaurantId: ctx.restaurantId,
      authorId: ctx.userId,
    },
    include: { author: { select: { name: true, email: true } } },
  });

  return NextResponse.json(
    {
      id: idea.id,
      text: idea.text,
      status: idea.status,
      createdAt: idea.createdAt.toISOString(),
      authorName: idea.author?.name ?? idea.author?.email ?? "—",
    },
    { status: 201 },
  );
}
