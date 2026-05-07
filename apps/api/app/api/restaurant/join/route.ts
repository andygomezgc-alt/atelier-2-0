import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { JoinRestaurantRequestSchema } from "@atelier/shared";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

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
  const parse = JoinRestaurantRequestSchema.safeParse(body);
  if (!parse.success) {
    return NextResponse.json({ error: parse.error.flatten() }, { status: 400 });
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { inviteCode: parse.data.code.toUpperCase() },
    select: { id: true, name: true },
  });

  if (!restaurant) {
    return NextResponse.json(
      { error: "Código no válido o expirado. Pide al administrador que genere uno nuevo." },
      { status: 404 },
    );
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { restaurantId: restaurant.id, role: "viewer" },
  });

  return NextResponse.json({ restaurantId: restaurant.id, restaurantName: restaurant.name });
}
