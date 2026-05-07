import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { CreateMenuRequestSchema } from "@atelier/shared";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = await requireAuth(req);
  if (isNextResponse(ctx)) return ctx;
  if (!ctx.restaurantId)
    return NextResponse.json({ error: "Not in a restaurant" }, { status: 403 });

  const menus = await prisma.menuFolder.findMany({
    where: { restaurantId: ctx.restaurantId },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { items: true } } },
  });

  return NextResponse.json(
    menus.map((m) => ({
      id: m.id,
      name: m.name,
      season: m.season,
      itemCount: m._count.items,
      updatedAt: m.updatedAt.toISOString(),
    })),
  );
}

export async function POST(req: NextRequest) {
  const ctx = await requireAuth(req, "create_menu");
  if (isNextResponse(ctx)) return ctx;

  const body = await req.json();
  const parse = CreateMenuRequestSchema.safeParse(body);
  if (!parse.success)
    return NextResponse.json({ error: parse.error.flatten() }, { status: 400 });

  const menu = await prisma.menuFolder.create({
    data: {
      name: parse.data.name,
      season: parse.data.season ?? null,
      restaurantId: ctx.restaurantId,
      presentationStyle: "elegant",
    },
  });

  return NextResponse.json(
    {
      id: menu.id,
      name: menu.name,
      season: menu.season,
      itemCount: 0,
      updatedAt: menu.updatedAt.toISOString(),
    },
    { status: 201 },
  );
}
