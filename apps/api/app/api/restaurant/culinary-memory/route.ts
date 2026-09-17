import { NextRequest, NextResponse } from "next/server";
import { PatchCulinaryMemorySchema, MemoryVersionSchema, can } from "@atelier/shared";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { getCulinaryMemory, patchCulinaryMemory, MemoryConflict } from "@/lib/culinary-memory/service";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  // Nuestra cocina la consultan quienes cocinan (el Lector no accede, como antes
  // de que "view_staff_recipe" incluyera a los Lectores).
  const ctx = await requireAuth(req, "capture_idea");
  if (isNextResponse(ctx)) return ctx;
  if (!ctx.restaurantId) return NextResponse.json({ error: "Not in a restaurant" }, { status: 403 });
  return NextResponse.json(await getCulinaryMemory(ctx.restaurantId, can(ctx.role, "approve_recipe")));
}
async function mutate(req: NextRequest, erase: boolean) {
  const ctx = await requireAuth(req, "approve_recipe");
  if (isNextResponse(ctx)) return ctx;
  if (!ctx.restaurantId) return NextResponse.json({ error: "Not in a restaurant" }, { status: 403 });
  if (!req.headers.get("authorization")?.startsWith("Bearer ")) {
    const origin = req.headers.get("origin");
    if (req.headers.get("sec-fetch-site") === "cross-site" || (origin && origin !== process.env.NEXTAUTH_URL)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }
  const raw = await req.json().catch(() => null);
  const parsed = (erase ? MemoryVersionSchema.strict() : PatchCulinaryMemorySchema).safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Invalid memory" }, { status: 400 });
  try { return NextResponse.json(await patchCulinaryMemory(ctx.restaurantId, parsed.data, erase)); }
  catch (error) {
    if (error instanceof MemoryConflict) return NextResponse.json({ error: "La memoria cambió. Vuelve a abrirla para revisar los cambios.", code: "memory_conflict" }, { status: 409 });
    throw error;
  }
}
export const PATCH = (req: NextRequest) => mutate(req, false);
export const DELETE = (req: NextRequest) => mutate(req, true);
