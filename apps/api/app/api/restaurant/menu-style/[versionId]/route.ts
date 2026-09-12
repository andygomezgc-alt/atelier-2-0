import { NextRequest, NextResponse } from "next/server";
import { ActivateMenuStyleSchema } from "@atelier/shared";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { activateMenuStyle, discardMenuStyle, MenuStyleError } from "@/lib/menu-style-versions";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ versionId: string }> };

export async function POST(req: NextRequest, { params }: Context) {
  const ctx = await requireAuth(req, "edit_menu");
  if (isNextResponse(ctx)) return ctx;
  if (!ctx.restaurantId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = ActivateMenuStyleSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    return NextResponse.json(await activateMenuStyle(ctx.restaurantId, (await params).versionId, body.data.expectedActiveVersionId, body.data.menuId));
  } catch (error) {
    if (error instanceof MenuStyleError) return NextResponse.json({ error: error.code, code: error.code }, { status: error.status });
    throw error;
  }
}

export async function DELETE(req: NextRequest, { params }: Context) {
  const ctx = await requireAuth(req, "edit_menu");
  if (isNextResponse(ctx)) return ctx;
  if (!ctx.restaurantId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try { return NextResponse.json(await discardMenuStyle(ctx.restaurantId, (await params).versionId)); }
  catch (error) {
    if (error instanceof MenuStyleError) return NextResponse.json({ error: error.code, code: error.code }, { status: error.status });
    throw error;
  }
}
