import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { CreateRestaurantRequestSchema, generateInviteCode } from "@atelier/shared";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = await requireAuth(req);
  if (isNextResponse(ctx)) return ctx;

  if (!ctx.restaurantId) {
    return NextResponse.json({ error: "Not in a restaurant" }, { status: 404 });
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: ctx.restaurantId },
    include: {
      users: {
        select: { id: true, name: true, email: true, photoUrl: true, role: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!restaurant) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    id: restaurant.id,
    name: restaurant.name,
    identityLine: restaurant.identityLine,
    photoUrl: restaurant.photoUrl,
    inviteCode: restaurant.inviteCode,
    staff: restaurant.users.map((u) => ({
      id: u.id,
      name: u.name ?? u.email ?? "",
      photoUrl: u.photoUrl,
      role: u.role ?? "viewer",
    })),
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, restaurantId: true },
  });

  if (!user) return NextResponse.json({ error: "User not found" }, { status: 401 });
  if (user.restaurantId) {
    return NextResponse.json({ error: "Already in a restaurant" }, { status: 409 });
  }

  const body = await req.json();
  const parse = CreateRestaurantRequestSchema.safeParse(body);
  if (!parse.success) {
    return NextResponse.json({ error: parse.error.flatten() }, { status: 400 });
  }

  const inviteCode = generateInviteCode(parse.data.name);

  const restaurant = await prisma.restaurant.create({
    data: {
      name: parse.data.name,
      identityLine: parse.data.identityLine,
      inviteCode,
    },
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { restaurantId: restaurant.id, role: "admin" },
  });

  return NextResponse.json(
    { id: restaurant.id, name: restaurant.name, inviteCode: restaurant.inviteCode },
    { status: 201 },
  );
}
