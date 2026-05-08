import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { PatchMenuRequestSchema } from "@atelier/shared";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";

export const dynamic = "force-dynamic";

async function loadFullMenu(menuId: string) {
  return prisma.menuFolder.findUnique({
    where: { id: menuId },
    include: {
      items: {
        orderBy: { order: "asc" },
        include: { recipe: { select: { title: true } } },
      },
    },
  });
}

function serialize(menu: NonNullable<Awaited<ReturnType<typeof loadFullMenu>>>) {
  return {
    id: menu.id,
    name: menu.name,
    season: menu.season,
    presentationStyle: menu.presentationStyle,
    items: menu.items.map((it) => ({
      id: it.id,
      recipeId: it.recipeId,
      name: it.customName ?? it.recipe?.title ?? "",
      description: it.customDesc ?? "",
      price: it.price,
      order: it.order,
    })),
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth(req);
  if (isNextResponse(ctx)) return ctx;
  if (!ctx.restaurantId)
    return NextResponse.json({ error: "Not in a restaurant" }, { status: 403 });
  const { id } = await params;

  const menu = await loadFullMenu(id);
  if (!menu || menu.restaurantId !== ctx.restaurantId)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(serialize(menu));
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth(req, "edit_menu");
  if (isNextResponse(ctx)) return ctx;
  const { id } = await params;

  const body = await req.json();
  const parse = PatchMenuRequestSchema.safeParse(body);
  if (!parse.success)
    return NextResponse.json({ error: parse.error.flatten() }, { status: 400 });

  const existing = await prisma.menuFolder.findUnique({ where: { id } });
  if (!existing || existing.restaurantId !== ctx.restaurantId)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.menuFolder.update({
    where: { id },
    data: parse.data,
  });

  const menu = await loadFullMenu(id);
  if (!menu) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(serialize(menu));
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth(req, "delete_menu");
  if (isNextResponse(ctx)) return ctx;
  const { id } = await params;

  const existing = await prisma.menuFolder.findUnique({ where: { id } });
  if (!existing || existing.restaurantId !== ctx.restaurantId)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.menuFolder.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
