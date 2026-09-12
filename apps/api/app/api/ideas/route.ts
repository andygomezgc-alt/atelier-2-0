import { NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { CreateIdeaRequestSchema, type CreateIdeaRequest } from "@atelier/shared";
import { withAuth } from "@/lib/with-auth";
import { logger } from "@/lib/logger";
import { projectIdea, ideaInclude } from "@/lib/projections";
import { IdeaSaveError, saveNewIdea } from "@/lib/create-idea";

export const dynamic = "force-dynamic";

export const GET = withAuth({}, async (ctx) => {
  const ideas = await prisma.idea.findMany({
    // archived = nota ya consumida (volvió receta): no aparece en Inicio.
    where: { restaurantId: ctx.restaurantId, status: { not: "archived" } },
    orderBy: { createdAt: "desc" },
    include: ideaInclude,
    take: 100,
  });

  return NextResponse.json(ideas.map(projectIdea));
});

export const POST = withAuth(
  { permission: "capture_idea", body: CreateIdeaRequestSchema },
  async (ctx, body: CreateIdeaRequest) => {
    try {
      const { idea, reused } = await saveNewIdea(ctx.restaurantId, ctx.userId, body);
      if (!reused) logger.info("idea_created", { ideaId: idea.id, restaurantId: ctx.restaurantId, userId: ctx.userId });
      return NextResponse.json(projectIdea(idea), { status: reused ? 200 : 201 });
    } catch (error) {
      if (error instanceof IdeaSaveError) return NextResponse.json({ error: error.code, code: error.code }, { status: error.status });
      throw error;
    }
  },
);
