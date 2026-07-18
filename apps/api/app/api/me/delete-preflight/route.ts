import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { computeLeaveCase } from "@/lib/leave-cases";

export const dynamic = "force-dynamic";

async function countAuthored(userId: string) {
  const [recipes, ideas, conversations, yieldTests] = await Promise.all([
    prisma.recipe.count({ where: { authorId: userId } }),
    prisma.idea.count({ where: { authorId: userId } }),
    prisma.conversation.count({ where: { authorId: userId } }),
    prisma.yieldTest.count({ where: { authorId: userId } }),
  ]);

  return { recipes, ideas, conversations, yieldTests };
}

export async function GET(req: NextRequest) {
  const ctx = await requireAuth(req);
  if (isNextResponse(ctx)) return ctx;

  const authoredPromise = countAuthored(ctx.userId);
  if (!ctx.restaurantId) {
    return NextResponse.json({
      case: "none",
      restaurantName: null,
      authored: await authoredPromise,
    });
  }

  const [result, restaurant, authored] = await Promise.all([
    computeLeaveCase(ctx.userId, ctx.restaurantId),
    prisma.restaurant.findUnique({
      where: { id: ctx.restaurantId },
      select: { name: true },
    }),
    authoredPromise,
  ]);

  return NextResponse.json({
    case: result.case,
    restaurantName: restaurant?.name ?? null,
    ...(result.case === "B"
      ? {
          otherMembers: result.otherMembers.map((member) => ({
            id: member.id,
            name: member.name,
            role: member.role,
          })),
        }
      : {}),
    authored,
  });
}
