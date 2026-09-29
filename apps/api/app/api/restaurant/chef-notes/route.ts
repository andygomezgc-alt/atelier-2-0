import { NextRequest, NextResponse } from "next/server";
import { prisma, Prisma } from "@atelier/db";
import { CHEF_NOTES_MAX, CreateChefNoteSchema, can } from "@atelier/shared";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
export const dynamic = "force-dynamic";
// Dos POST casi simultáneos podrían pasar los dos el tope de 10. Serializable hace
// que Postgres aborte uno con P2034; el reintento ya ve la nota del otro.
const MAX_ATTEMPTS = 3;
const select = { id: true, text: true, createdAt: true } as const;
const toResponse = (note: { id: string; text: string; createdAt: Date }) => ({ id: note.id, text: note.text, createdAt: note.createdAt.toISOString() });
export async function GET(req: NextRequest) {
  // Como la memoria: la consultan quienes cocinan; solo quien aprueba edita.
  const ctx = await requireAuth(req, "capture_idea");
  if (isNextResponse(ctx)) return ctx;
  if (!ctx.restaurantId) return NextResponse.json({ error: "Not in a restaurant" }, { status: 403 });
  const notes = await prisma.chefNote.findMany({ where: { restaurantId: ctx.restaurantId }, orderBy: { createdAt: "asc" }, select });
  return NextResponse.json({ notes: notes.map(toResponse), canEdit: can(ctx.role, "approve_recipe") });
}
export async function POST(req: NextRequest) {
  const ctx = await requireAuth(req, "approve_recipe");
  if (isNextResponse(ctx)) return ctx;
  const restaurantId = ctx.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Not in a restaurant" }, { status: 403 });
  if (!req.headers.get("authorization")?.startsWith("Bearer ")) {
    const origin = req.headers.get("origin");
    if (req.headers.get("sec-fetch-site") === "cross-site" || (origin && origin !== process.env.NEXTAUTH_URL)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }
  const parsed = CreateChefNoteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid note" }, { status: 400 });
  for (let attempt = 1; ; attempt++) {
    try {
      const note = await prisma.$transaction(async tx => {
        if (await tx.chefNote.count({ where: { restaurantId } }) >= CHEF_NOTES_MAX) return null;
        return tx.chefNote.create({ data: { restaurantId, text: parsed.data.text }, select });
      }, { isolationLevel: "Serializable" });
      if (!note) return NextResponse.json({ error: "Ya hay 10 notas. Borra alguna para añadir otra.", code: "chef_notes_limit" }, { status: 409 });
      return NextResponse.json(toResponse(note), { status: 201 });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") || attempt >= MAX_ATTEMPTS) throw error;
    }
  }
}
