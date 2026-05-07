import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { PatchMeRequestSchema } from "@atelier/shared";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = await requireAuth(req);
  if (isNextResponse(ctx)) return ctx;

  const user = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: {
      id: true,
      email: true,
      name: true,
      photoUrl: true,
      bio: true,
      role: true,
      languagePref: true,
      defaultModel: true,
      restaurantId: true,
      restaurant: { select: { name: true } },
    },
  });

  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  return NextResponse.json({
    id: user.id,
    email: user.email ?? "",
    name: user.name ?? user.email ?? "",
    photoUrl: user.photoUrl,
    bio: user.bio,
    role: user.role ?? "viewer",
    languagePref: user.languagePref ?? "es",
    defaultModel: user.defaultModel ?? "sonnet",
    restaurantId: user.restaurantId,
    restaurantName: user.restaurant?.name ?? null,
  });
}

export async function PATCH(req: NextRequest) {
  const ctx = await requireAuth(req);
  if (isNextResponse(ctx)) return ctx;

  const body = await req.json();
  const parse = PatchMeRequestSchema.safeParse(body);
  if (!parse.success) {
    return NextResponse.json({ error: parse.error.flatten() }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: ctx.userId },
    data: parse.data,
    select: {
      id: true,
      email: true,
      name: true,
      photoUrl: true,
      bio: true,
      role: true,
      languagePref: true,
      defaultModel: true,
      restaurantId: true,
      restaurant: { select: { name: true } },
    },
  });

  return NextResponse.json({
    id: updated.id,
    email: updated.email ?? "",
    name: updated.name ?? updated.email ?? "",
    photoUrl: updated.photoUrl,
    bio: updated.bio,
    role: updated.role ?? "viewer",
    languagePref: updated.languagePref ?? "es",
    defaultModel: updated.defaultModel ?? "sonnet",
    restaurantId: updated.restaurantId,
    restaurantName: updated.restaurant?.name ?? null,
  });
}
