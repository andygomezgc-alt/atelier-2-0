import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { CreateRestaurantRequestSchema } from "@atelier/shared";
import { generateInviteCode } from "@atelier/shared/invite-code";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
import { auth } from "@/lib/auth";
import { projectRestaurant, restaurantInclude } from "@/lib/projections";

export const dynamic = "force-dynamic";

// TODO: dedupe with restaurant/join/route.ts if a 3rd usage appears.
function validateOrigin(req: NextRequest): NextResponse | null {
  // Skip for Bearer auth (mobile) — no same-origin Origin header expected.
  if (req.headers.get("authorization")?.startsWith("Bearer ")) return null;

  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") {
    return NextResponse.json({ error: "CSRF: invalid origin" }, { status: 403 });
  }

  const origin = req.headers.get("origin");
  if (origin && origin !== process.env.NEXTAUTH_URL) {
    return NextResponse.json({ error: "CSRF: invalid origin" }, { status: 403 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const ctx = await requireAuth(req);
  if (isNextResponse(ctx)) return ctx;

  if (!ctx.restaurantId) {
    return NextResponse.json({ error: "Not in a restaurant" }, { status: 404 });
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: ctx.restaurantId },
    include: restaurantInclude,
  });

  if (!restaurant) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(projectRestaurant(restaurant));
}

export async function POST(req: NextRequest) {
  const csrf = validateOrigin(req);
  if (csrf) return csrf;

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
