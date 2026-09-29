import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
export const dynamic = "force-dynamic";
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuth(req, "approve_recipe");
  if (isNextResponse(ctx)) return ctx;
  if (!ctx.restaurantId) return NextResponse.json({ error: "Not in a restaurant" }, { status: 403 });
  if (!req.headers.get("authorization")?.startsWith("Bearer ")) {
    const origin = req.headers.get("origin");
    if (req.headers.get("sec-fetch-site") === "cross-site" || (origin && origin !== process.env.NEXTAUTH_URL)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }
  const { id } = await params;
  // Filtrar por restaurante en el propio borrado: una nota ajena no se toca (404).
  const { count } = await prisma.chefNote.deleteMany({ where: { id, restaurantId: ctx.restaurantId } });
  if (count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
