import { NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { CreateIdeaRequestSchema, type CreateIdeaRequest } from "@atelier/shared";
import { withAuth } from "@/lib/with-auth";
import { logger } from "@/lib/logger";
import { projectIdea, ideaInclude } from "@/lib/projections";

export const dynamic = "force-dynamic";

export const GET = withAuth({}, async (ctx) => {
  const ideas = await prisma.idea.findMany({
    where: { restaurantId: ctx.restaurantId },
    orderBy: { createdAt: "desc" },
    include: ideaInclude,
    take: 100,
  });

  return NextResponse.json(ideas.map(projectIdea));
});

export const POST = withAuth(
  { permission: "capture_idea", body: CreateIdeaRequestSchema },
  async (ctx, body: CreateIdeaRequest) => {
    const idea = await prisma.idea.create({
      data: {
        text: body.text,
        restaurantId: ctx.restaurantId,
        authorId: ctx.userId,
      },
      include: ideaInclude,
    });

    logger.info("idea_created", {
      ideaId: idea.id,
      restaurantId: ctx.restaurantId,
      userId: ctx.userId,
    });

    return NextResponse.json(projectIdea(idea), { status: 201 });
  },
);
