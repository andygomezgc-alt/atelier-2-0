import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { JoinRestaurantRequestSchema } from "@atelier/shared";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// TODO: dedupe with restaurant/route.ts if a 3rd usage appears.
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

export async function POST(req: NextRequest) {
  const csrf = validateOrigin(req);
  if (csrf) return csrf;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Brute-force protection: 10 attempts per 10 min per authenticated user.
  const rl = rateLimit(`join:${session.user.id}`, { max: 10, windowMs: 10 * 60 * 1000 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Demasiados intentos. Espera unos minutos antes de volver a intentarlo." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter ?? 60) } },
    );
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
