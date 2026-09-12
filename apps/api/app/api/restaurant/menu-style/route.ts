import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const ctx = await requireAuth(req, "edit_menu");
  if (isNextResponse(ctx)) return ctx;
  if (!ctx.restaurantId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const restaurant = await prisma.restaurant.findUnique({ where: { id: ctx.restaurantId }, select: { menuStyleVersionId: true } });
  if (!restaurant) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const versions = await prisma.menuStyleVersion.findMany({
    where: { restaurantId: ctx.restaurantId, discardedAt: null }, orderBy: { createdAt: "desc" }, take: 100,
    select: { id: true, name: true, createdAt: true, activatedAt: true, refUrl: true, mimeType: true },
  });
  if (restaurant.menuStyleVersionId && !versions.some(v => v.id === restaurant.menuStyleVersionId)) {
    const active = await prisma.menuStyleVersion.findFirst({
      where: { id: restaurant.menuStyleVersionId, restaurantId: ctx.restaurantId, discardedAt: null },
      select: { id: true, name: true, createdAt: true, activatedAt: true, refUrl: true, mimeType: true },
    });
    if (active) versions.unshift(active);
  }
  return NextResponse.json({ activeVersionId: restaurant.menuStyleVersionId,
    versions: versions.map(v => ({ ...v, createdAt: v.createdAt.toISOString(), activatedAt: v.activatedAt?.toISOString() ?? null, isActive: v.id === restaurant.menuStyleVersionId })),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
