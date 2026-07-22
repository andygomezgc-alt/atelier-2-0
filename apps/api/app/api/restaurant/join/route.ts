import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@atelier/db";
import { JoinRestaurantRequestSchema } from "@atelier/shared";
import { requireAuth, isNextResponse } from "@/lib/permissions-guard";
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

  const ctx = await requireAuth(req);
  if (isNextResponse(ctx)) return ctx;

  // Brute-force protection: 10 attempts per 10 min per authenticated user.
  const rl = rateLimit(`join:${ctx.userId}`, { max: 10, windowMs: 10 * 60 * 1000 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Demasiados intentos. Espera unos minutos antes de volver a intentarlo.", code: "invite_rate_limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter ?? 60) } },
    );
  }

  if (ctx.restaurantId) {
    return NextResponse.json({ error: "Already in a restaurant", code: "already_in_restaurant" }, { status: 409 });
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
      { error: "Código no válido o expirado. Pide al administrador que genere uno nuevo.", code: "invite_code_invalid" },
      { status: 404 },
    );
  }

  // Carrera: el check de arriba usa ctx.restaurantId, que viene del token y
  // puede estar rancio (el usuario ya se unió a otro restaurante en otra
  // sesión). El guard `restaurantId: null` en el updateMany cierra la carrera
  // atómicamente: si el usuario ya tiene restaurante, count===0 y respondemos
  // 409 con el mismo code que el cliente ya traduce (already_in_restaurant).
  const claimed = await prisma.user.updateMany({
    where: { id: ctx.userId, restaurantId: null },
    data: { restaurantId: restaurant.id, role: "viewer" },
  });
  if (claimed.count === 0) {
    return NextResponse.json(
      { error: "Already in a restaurant", code: "already_in_restaurant" },
      { status: 409 },
    );
  }

  // Devolvemos `role` también: el cliente lo usa con patchLocalUser para
  // actualizar auth-state sin un GET /me extra (A-10 / Ola 0 0.2).
  return NextResponse.json({
    restaurantId: restaurant.id,
    restaurantName: restaurant.name,
    role: "viewer",
  });
}
