import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { CreateRecipeRequestSchema } from "@atelier/shared";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import type { Prisma } from "@atelier/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = await requireAuth(req);
  if (isNextResponse(ctx)) return ctx;
  if (!ctx.restaurantId)
    return NextResponse.json({ error: "Not in a restaurant" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const state = searchParams.get("state") as "draft" | "in_test" | "approved" | null;
  const priorityParam = searchParams.get("priority");
  const q = searchParams.get("q");

  const where: Prisma.RecipeWhereInput = { restaurantId: ctx.restaurantId };
  if (state) where.state = state;
  if (priorityParam === "true") where.priority = true;
  if (q) where.title = { contains: q, mode: "insensitive" };

  const recipes = await prisma.recipe.findMany({
    where,
    orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
    include: { author: { select: { name: true, email: true } } },
    take: 200,
  });

  return NextResponse.json(
    recipes.map((r) => ({
      id: r.id,
      title: r.title,
      state: r.state,
      priority: r.priority,
      version: r.version,
      authorName: r.author?.name ?? r.author?.email ?? "—",
      updatedAt: r.updatedAt.toISOString(),
    })),
  );
}

export async function POST(req: NextRequest) {
  const ctx = await requireAuth(req, "edit_recipe");
  if (isNextResponse(ctx)) return ctx;

  const body = await req.json();
  const parse = CreateRecipeRequestSchema.safeParse(body);
  if (!parse.success)
    return NextResponse.json({ error: parse.error.flatten() }, { status: 400 });

  const recipe = await prisma.recipe.create({
    data: {
      title: parse.data.title,
      contentJson: parse.data.contentJson,
      restaurantId: ctx.restaurantId,
      authorId: ctx.userId,
      sourceConversationId: parse.data.sourceConversationId ?? null,
      state: "draft",
      priority: false,
      version: 1,
    },
    include: { author: { select: { name: true, email: true } } },
  });

  return NextResponse.json(
    {
      id: recipe.id,
      title: recipe.title,
      state: recipe.state,
      priority: recipe.priority,
      version: recipe.version,
      authorName: recipe.author?.name ?? recipe.author?.email ?? "—",
      updatedAt: recipe.updatedAt.toISOString(),
    },
    { status: 201 },
  );
}
